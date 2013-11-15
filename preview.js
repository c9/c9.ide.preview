define(function(require, exports, module) {
    main.consumes = [
        "Editor", "editors", "settings", "Menu", "ui", 
        "preferences", "layout", "tabManager", "tree", "commands"
    ];
    main.provides = ["preview"];
    return main;
    
    // @todo - Add XML Plugin
    // @todo - Add JSON Plugin
    // @todo - Add Coffee Plugin
    // @todo - Add Jade Plugin
    // @todo - Add HTML/CSS/JS (auto-updating) Plugin
    // @todo - Add additional functionality, such as popout (levels, in editor, pane, browser pane)
    // @todo - Fix the activate/deactivate events on session. They leak / are not cleaned up
    
    function main(options, imports, register) {
        var Editor   = imports.Editor;
        var editors  = imports.editors;
        var ui       = imports.ui;
        var settings = imports.settings;
        var commands = imports.commands;
        var layout   = imports.layout;
        var tree     = imports.tree;
        var tabs     = imports.tabManager;
        var prefs    = imports.preferences;
        var Menu     = imports.Menu;
        
        var extensions = [];
        var counter    = 0;
        
        var previewUrl = options.previewUrl;
        
        /***** Initialization *****/
        
        var handle     = editors.register("preview", "Preview", 
                                           Preview, extensions);
        var handleEmit = handle.getEmitter();
        
        var previewers = {};
        var menu;
        
        function load(){
            var parent = layout.findParent({ name: "preview" });
            var button = !options.hideButton && new ui.button({
                skin     : "c9-toolbarbutton-glossy",
                "class"  : "preview",
                tooltip  : "Preview the current document",
                caption  : "Preview",
                disabled : true,
                onclick  : function() {
                    var tab = tabs.focussedTab;
                    if (tab && tab.editor.type === "preview" || !tab.path)
                        return;
                    
                    // Find a good location to open preview side-by-side
                    var pane;
                    var otherPreview = search();
                    if (otherPreview && tab.pane != otherPreview) {
                        pane = otherPreview;
                    }
                    else {
                        var nodes = tab.pane.group;
                        if (!nodes)
                            pane = tab.pane.hsplit(true);
                        else {
                            pane = nodes[nodes.indexOf(tab.pane) === 0 ? 1 : 0];
                        }
                    }
                    
                    // Open Preview
                    openPreview(tab.path, pane);
                }
            });
            button && ui.insertByIndex(parent, button, 10, handle);
            
            tabs.on("focus", function(e){
                var disabled = typeof e.tab.path != "string";
                button && button.setAttribute("disabled", disabled);
            }, handle);
            
            tabs.on("tabDestroy", function(e){
                if (e.last && button)
                    button.disable();
            }, handle);
            
            settings.on("read", function(e){
                settings.setDefaults("user/preview", [
                    ["running_app", "false"],
                    ["default", options.defaultPreviewer || "raw"]
                ]);
            }, handle);
            
            // Preferences
            prefs.add({
                "Run" : {
                    position : 600,
                    "Preview" : {
                        position : 200,
                        "Preview Running Apps" : {
                            type : "checkbox",
                            path : "user/preview/@running_app",
                            position : 4000
                        },
                        "Default Previewer" : {
                            type : "dropdown",
                            path : "user/preview/@default",
                            position : 5000,
                            items : [
                                // @todo this should come from plugin api
                                { caption: "Raw", value: "preview.raw" },
                                { caption: "Browser", value: "preview.browser" }
                            ]
                        },
                    }
                }
            }, handle);
            
            // Context menu for tree
            var itemCtxTreePreview = new apf.item({
                match   : "file",
                caption : "Preview",
                isAvailable : function(){
                    return tree.selectedNode && !tree.selectedNode.isFolder;
                },
                onclick : function(){
                    openPreview(tree.selected);
                }
            });
            tree.getElement("mnuCtxTree", function(mnuCtxTree) {
                ui.insertByIndex(mnuCtxTree, itemCtxTreePreview, 160, handle);
            });
            
            // Command
            commands.addCommand({
                name    : "reloadpreview",
                bindKey : { mac: "Command-.", win: "Ctrl-." },
                exec : function(){
                    var path = tabs.focussedTab && tabs.focussedTab.path;
                    var tab  = searchTab(path) || searchTab() || searchTab(-1);
                    if (tab) {
                        tabs.focusTab(tab);
                        tab.editor.reload();
                    }
                }
            }, handle)
            
            menu = new Menu({}, handle);
        }
        
        var drawn = false;
        function drawHandle(){
            if (drawn) return;
            drawn = true;
            
            // Import Skin
            ui.insertSkin({
                name         : "previewskin",
                data         : require("text!./skin.xml"),
                "media-path" : options.staticPrefix + "/images/",
                "icon-path"  : options.staticPrefix + "/images/"
            }, handle);
            
            // Import CSS
            var css = require("text!./style.css");
            ui.insertCss(css, options.staticPrefix, handle);
            
            handleEmit("draw", null, true);
        }
        
        //Search through pages
        function search(){
            var pane;
            tabs.getTabs().every(function(tab){
                if (tab.editorType == "preview") {
                    pane = tab.pane;
                    return false;
                }
                return true;
            });
            return pane;
        }
        function searchTab(path){
            var pane;
            tabs.getTabs().every(function(tab){
                if (tab.editorType == "preview" 
                  && (!path && tab.isActive()
                  || path && path != -1 
                  && path == tab.document.getSession().path)) {
                    pane = tab;
                    return false;
                }
                return true;
            });
            return pane;
        }
        
        function registerPlugin(plugin, matcher){
            previewers[plugin.name] = {
                plugin  : plugin,
                matcher : matcher
            };
        }
        
        function unregisterPlugin(plugin){
            delete previewers[plugin.name];
        }
        
        function openPreview(path, pane){
            tabs.open({
                name       : "preview-" + path,
                editorType : "preview",
                pane       : pane,
                active     : true,
                document   : {
                    preview : {
                        path : path
                    }
                }
            }, function(){});
        }
        
        function findPreviewer(path, id){
            if (id) return previewers[id].plugin;
            else if (path) {
                for (id in previewers) {
                    if (previewers[id].matcher(path))
                        return previewers[id].plugin;
                }
            }
            
            id = settings.get("user/preview/@default");
            return previewers[id].plugin;
        }
        
        /**
         * The preview handle, responsible for managing preview plugins. 
         * This is the object you get when you request the preview
         * service in your plugin.
         * 
         * Example:
         * 
         *     define(function(require, exports, module) {
         *         main.consumes = ["preview"];
         *         main.provides = ["myplugin"];
         *         return main;
         *     
         *         function main(options, imports, register) {
         *             var preview = imports.preview;
         *             
         *             var previewer = preview.findPreviewer("preview.browser");
         *         });
         *     });
         * 
         * @class preview
         * @extends Plugin
         * @singleton
         */
        handle.freezePublicAPI({
            /**
             * The base URL for previewing files
             * @property {String} previewUrl
             */
            get previewUrl(){ return previewUrl; },
            
            /**
             * The menu shown to select the previewer
             * @property {Menu} previewMenu
             */
            get previewMenu(){ return menu; },
            
            /**
             * Adds a previewer to the list of known previewers.
             * 
             * *N.B. The {@link Previewer} base class already calls this method.*
             * 
             * @param {Previewer} previewer  the previewer to register.
             * @private
             */
            register : registerPlugin,
            
            /**
             * Removes a previewer from the list of known previewers. 
             * 
             * *N.B. The {@link Previewer} base class already calls this method.*
             * 
             * @param {Previewer} previewer  the previewer to unregister.
             * @private
             */
            unregister : unregisterPlugin,
            
            /**
             * Retrieves a previewer based on a file path or id.
             * @param {String} path  The path of the file that is to be previewed
             * @param {String} id    The unique name of the previewer to retrieve
             * @return {Previewer}
             */
            findPreviewer : findPreviewer,
        });
        
        handle.on("load", load);
        
        function Preview(){
            var plugin = new Editor("Ajax.org", main.consumes, extensions);
            //var emit   = plugin.getEmitter();
            
            var currentDocument, currentSession;
            var container, txtPreview, btnMode;
            
            plugin.on("draw", function(e){
                drawHandle();
                
                // Create UI elements
                var bar = e.tab.appendChild(new ui.vsplitbox({
                    anchors    : "0 0 0 0",
                    childNodes : [
                        new ui.hsplitbox({
                            "class"    : "toolbar-top previewbar",
                            height     : 35,
                            edge       : "4",
                            padding    : 3,
                            childNodes : [
                                new ui.button({
                                    skin    : "c9-toolbarbutton-glossy",
                                    "class" : "refresh",
                                    width   : "30",
                                    onclick : function(e){ reload(); }
                                }),
                                new ui.hsplitbox({
                                    padding    : 3,
                                    childNodes : [
                                        new ui.bar({
                                            id         : "locationbar",
                                            "class"    : "locationbar",
                                            childNodes : [
                                                new ui.textbox({
                                                    id          : "txtPreview",
                                                    class       : "ace_searchbox tb_textbox searchbox searchTxt tb_console",
                                                    value       : "",
                                                    focusselect : true
                                                }),
                                                new ui.button({
                                                    id      : "btnMode",
                                                    submenu : menu.aml,
                                                    icon    : "page_white.png",
                                                    skin    : "btn-preview-choice",
                                                    skinset : "previewskin",
                                                    caption : "browser"
                                                })
                                            ]
                                        }),
                                        new ui.button({
                                            skin    : "c9-toolbarbutton-glossy",
                                            "class" : "popout",
                                            width   : "30",
                                            onclick : function(e){ popout(); }
                                        })
                                    ]
                                })
                            ]
                        }),
                        new ui.bar({
                            id : "container"
                        })
                    ]
                }));
                plugin.addElement(bar);
                
                btnMode    = plugin.getElement("btnMode");
                txtPreview = plugin.getElement("txtPreview");
                container  = plugin.getElement("container").$int;
                
                txtPreview.$input.onkeydown = function(e){
                    if (e.keyCode == 13) {
                        currentSession.previewer.navigate({ url: this.value });
                        txtPreview.blur();
                    }
                }
                
                txtPreview.addEventListener("contextmenu", function(e){
                    e.cancelBubble = true;
                    return true;
                });
            })
            
            /***** Method *****/
            
            function reload(){
                var session = currentSession;
                if (session) 
                    session.previewer.reload();
            }
            
            function popout(){
                currentSession.previewer.popout();
            }
            
            function setPreviewer(id){
                var session = currentSession;
                if (session) {
                    // Check if previewer is available
                    if (!previewers[id]) 
                        return layout.showError("Could not find previewer:" + id);
                    
                    // If this previewer is already active, do nothing
                    if (session.previewer.name == id)
                        return;
                    
                    var doc   = currentDocument;
                    var state = plugin.getState(doc);
                    
                    // Unload the previous previewer
                    if (session.previewer) {
                        session.cleanUp();
                        session.previewer.unloadDocument(doc);
                    }
                        
                    // Enable the new previewer
                    var previewer = previewers[id].plugin;
                    session.previewer = previewer;
                    
                    previewer.loadDocument(doc, plugin, state);
                    previewer.activateDocument(doc);
                    previewer.navigate({ url: session.path });
                }
            }
            
            function setLocation(value){
                txtPreview.setValue(value);
            }
            
            function setButtonStyle(caption, icon) {
                btnMode.setCaption(caption);
                btnMode.setIcon(icon);
            }
            
            /***** Lifecycle *****/
            
            plugin.on("load", function(){
            });
            plugin.on("documentLoad", function(e){
                var doc     = e.doc;
                var session = doc.getSession();
                
                doc.tab.backgroundColor = "rgb(41, 41, 41)";
                doc.tab.className.add("dark");
                
                // session.path = session.path || e.state.path;
                session.initPath = session.path || e.state.path;
                
                session.previewer = findPreviewer(session.initPath, (e.state || 0).previewer);
                session.previewer.loadDocument(doc, plugin);
                
                tabs.on("open", function(e){
                    if (!session.previewTab && e.options.path == session.path) {
                        session.previewTab = e.tab;
                        session.previewer.navigate({ url : session.path, tab: e.tab });
                    }
                }, session);
            });
            plugin.on("documentActivate", function(e){
                if (currentDocument)
                    currentSession.previewer.deactivateDocument(currentDocument);
                
                currentDocument = e.doc;
                currentSession  = e.doc.getSession();
                
                var previewer = currentSession.previewer;
                previewer.activateDocument(currentDocument);
                
                // @todo shouldn't previewTab be set here?
                if (currentSession.initPath) {
                    previewer.navigate({ url: currentSession.initPath });
                    delete currentSession.initPath;
                }
            });
            plugin.on("documentUnload", function(e){
                var session = e.doc.getSession();
                session.previewer.navigate(e.doc, true); // Remove the listener
                session.previewer.unloadDocument(e.doc);
                
                if (session == currentSession) {
                    currentDocument = null;
                    currentSession  = null;
                }
            });
            plugin.on("getState", function(e){
                var state = e.state;
                var session = e.doc.getSession();
                
                state.path      = session.path;
                state.previewer = session.previewer.name;
                
                session.previewer.getState(e.doc, state);
            });
            plugin.on("setState", function(e){
                var state   = e.state;
                var session = e.doc.getSession();
                
                session.path      = state.path;
                // session.previewer = state.previewer;
                
                session.previewer.setState(e.doc, state);
            });
            plugin.on("clear", function(){
            });
            plugin.on("focus", function(e){
                if (currentSession)
                    currentSession.previewer.focus(e);
            });
            plugin.on("blur", function(e){
                if (currentSession)
                    currentSession.previewer.blur(e);
            });
            plugin.on("enable", function(){
            });
            plugin.on("disable", function(){
            });
            plugin.on("unload", function(){
                // unload all previewers?
            });
            
            /***** Register and define API *****/
            
            /**
             * Preview pane for previewing files and content in a Cloud9 tab.
             * 
             * There are a few default previewers (i.e. 
             * {@link preview.browser browser}, {@link preview.raw raw},
             * {@link preview.markdown markdown}).
             * 
             * It's easy to make additional previewers. See {@link Previewer}.
             * 
             * Plugins can open a preview tab using the {@link tab} API:
             * 
             *     tabManager.open({
             *         editorType : "preview",
             *         active     : true,
             *         document   : {
             *             preview : {
             *                 path: "https://c9.io"
             *             }
             *         }
             *     }, function(err, tab) {});
             * 
             * Alternatively, use an urlView to open just the page without
             * the browser controls and URL bar:
             * 
             *     tabManager.open({
             *         value      : "http://www.c9.io",
             *         editorType : "urlview",
             *         active     : true,
             *         document   : {
             *             urlview : {
             *                 backgroundColor : "#FF0000",
             *                 dark            : true
             *             }
             *         }
             *     }, function(err, tab) {})
             **/
            plugin.freezePublicAPI({
                /**
                 * The HTML element to attach your custom previewer to.
                 * @property {HTMLElement} container
                 */
                get container(){ return container; },
                
                /**
                 * Trigger a reload of the content displayed in the previewer.
                 */
                reload : reload,
                
                /**
                 * Pop the previewer out of the Cloud9 tab into a new window.
                 * @ignore Not implemented
                 */
                popout : popout,
                
                /**
                 * Change to a different previewer for the displayed content.
                 * @param {String} name  The name of the previewer to show (e.g. "previewer.browser").
                 */
                setPreviewer : setPreviewer,
                
                /**
                 * Set the value of the location bar of the preview pane.
                 * @param {String} value  The value of the location bar.
                 */
                setLocation : setLocation,
                
                /**
                 * Set the icon and label of the button in the preview bar that
                 * allows users to choose which previewer to use.
                 * @param {String} caption  The caption of the button.
                 * @param {String} icon     The icon of the button.
                 */
                setButtonStyle : setButtonStyle
            });
            
            plugin.load("preview" + counter++);
            
            return plugin;
        }
        
        register(null, {
            preview: handle
        });
    }
});