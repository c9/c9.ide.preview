/**
 * App or HTML previewer in Cloud9 IDE
 *
 * @copyright 2010, Ajax.org B.V.
 * @license GPLv3 <http://www.gnu.org/licenses/gpl.txt>
 */
define(function(require, exports, module) {
    main.consumes = [
        "c9", "editor", "editors", "util", "settings", "menus", "ui", 
        "preferences", "layout", "tabs"
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
        var Editor   = imports.editor;
        var editors  = imports.editors;
        var c9       = imports.c9;
        var ui       = imports.ui;
        var util     = imports.util;
        var settings = imports.settings;
        var layout   = imports.layout;
        var tabs     = imports.tabs;
        var prefs    = imports.preferences;
        var menus    = imports.menus;
        var Menu     = menus.Menu;
        // var MenuItem = menus.MenuItem;
        // var Divider  = menus.Divider;
        
        var extensions = [];
        var counter    = 0;
        
        /***** Initialization *****/
        
        var handle     = editors.register("preview", "Preview", 
                                           Preview, extensions);
        var handleEmit = handle.getEmitter();
        
        var previewers = {};
        var menu;
        
        function load(){
            var parent = layout.findParent({ name: "preview" });
            var button = new apf.button({
                skin : "c9-toolbarbutton-glossy",
                "class" : "preview",
                tooltip : "Preview The Focussed Document",
                caption : "Preview",
                disabled : true,
                onclick : function() {
                    var tab = tabs.focussedPage;
                    if (tab && tab.editor.type === "preview")
                        return;
                    
                    tabs.open({
                        name       : "preview-" + tab.path,
                        editorType : "preview",
                        active     : true,
                        document   : {
                            preview : {
                                path : tab.path
                            }
                        }
                    }, function(){});
                }
            });
            ui.insertByIndex(parent, button, 10, handle);
            
            tabs.on("focus", function(e){
                var disabled = typeof e.tab.path != "string";
                button.setAttribute("disabled", disabled);
            }, handle);
            
            tabs.on("tabDestroy", function(e){
                if (e.last)
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
                    "Run & Debug" : {
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
            var css = util.replaceStaticPrefix(require("text!./style.css"));
            ui.insertCss(css, handle);
            
            handleEmit("draw");
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
         * 
         */
        handle.freezePublicAPI({
            get previewMenu(){ return menu; },
            
            /**
             * 
             */
            register : registerPlugin,
            
            /**
             * 
             */
            unregister : unregisterPlugin,
            
            /**
             * 
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
                                    skin    : "btn-preview-nav",
                                    skinset : "previewskin",
                                    "class" : "refresh",
                                    width   : "30",
                                    onclick : function(e){ reload(); }
                                }),
                                // new ui.hsplitbox({
                                //     padding    : 0,
                                //     childNodes : [
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
                                //         new ui.button({
                                //             skin    : "btn-preview-nav",
                                //             skinset : "previewskin",
                                //             width   : 30,
                                //             class   : "popup",
                                //             onclick : function(e){ popup(); }
                                //         })
                                //     ]
                                // })
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
                        currentDocument.getSession().navigate({ url: this.value });
                        txtPreview.blur();
                    }
                }
            })
            
            /***** Method *****/
            
            function reload(){
                var session = currentSession;
                if (session) session.reload();
            }
            
            function popup(){
                
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
                    session.previewer = previewers[id].plugin;
                    session.previewer.loadDocument(doc, plugin, state);
                    
                    session.activate();
                    
                    session.navigate({ url: session.path });
                }
            }
            
            /***** Lifecycle *****/
            
            plugin.on("load", function(){
            });
            
            plugin.on("documentLoad", function(e){
                var doc     = e.doc;
                var session = doc.getSession();
                
                function changeListener(){
                    session.update({
                        saved: session.previewPage
                            .document.undoManager.isAtBookmark()
                    });
                };
                function renameListener(e){
                    session.navigate({ url: e.path });
                }
                
                var emit = session.getEmitter();
                session.update     = function(e){ emit("update", e); };
                session.reload     = function(){ emit("reload"); };
                session.activate   = function(){ emit("activate"); };
                session.deactivate = function(){ emit("deactivate"); };
                session.navigate   = function(e){ 
                    if (session.previewPage) {
                        var doc = session.previewPage.document;
                        
                        // Remove previous change listener
                        doc.undoManager.off("change", changeListener);
                        
                        // Remove previous path listener
                        doc.tab.off("path.set", renameListener);
                    }
                    
                    if (!e) return; // For cleanup
                    
                    // Find new tab
                    session.path        = e.url
                    e.tab              =
                    session.previewPage = tabs.findPage(session.path);
                    
                    // Set new change listener
                    if (session.previewPage) {
                        var doc = session.previewPage.document;
                        
                        // Listen to value changes
                        doc.undoManager.on("change", changeListener);
                        
                        // Listen to path changes
                        doc.tab.on("setPath", renameListener);
                    }
                    
                    emit("navigate", e); 
                };
                
                doc.tab.backgroundColor = "rgb(41, 41, 41)";
                doc.tab.className.add("dark");
                
                session.path = session.path || e.state.path;
                
                session.previewer = findPreviewer(session.path, (e.state || 0).previewer);
                session.previewer.loadDocument(doc, plugin);
                
                session.navigate({ url: session.path });
                
                tabs.on("open", function(e){
                    if (!session.previewPage && e.options.path == session.path) {
                        session.previewPage = e.tab;
                        session.navigate({ url : session.path, tab: e.tab });
                    }
                }, session);
            });
            plugin.on("documentActivate", function(e){
                if (currentDocument)
                    currentDocument.getSession().deactivate();
                    
                currentDocument = e.doc;
                currentSession  = e.doc.getSession();
                
                currentSession.activate();
            });
            plugin.on("documentUnload", function(e){
                var session = e.doc.getSession();
                session.previewer.unloadDocument(e.doc);
                session.navigate(); // Remove the listener
            });
            plugin.on("getState", function(e){
                var state = e.state;
                var session = e.doc.getSession();
                
                state.path      = session.path;
                state.previewer = session.previewer.name;
                
                session.getEmitter()("state.get", e);
            });
            plugin.on("setState", function(e){
                var state   = e.state;
                var session = e.doc.getSession();
                
                session.path      = state.path;
                // session.previewer = state.previewer;
                
                session.getEmitter()("state.set", e);
            });
            plugin.on("clear", function(){
            });
            plugin.on("focus", function(e){
                // currentSession.previewer.focus(e);
            });
            plugin.on("blur", function(e){
                // currentSession.previewer.blur(e);
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
             * Read Only Image Editor
             **/
            plugin.freezePublicAPI({
                /**
                 * HTML Element to attach your custom previewer to
                 */
                get container(){ return container; },
                
                /**
                 * 
                 */
                reload : reload,
                
                /**
                 * 
                 */
                popup   : popup,
                
                /**
                 * 
                 */
                setPreviewer : setPreviewer
            });
            
            plugin.load("preview" + counter++);
            
            return plugin;
        }
        
        register(null, {
            preview: handle
        });
    }
});