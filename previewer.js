define(function(require, module, exports) {
    main.consumes = [
        "Plugin", "preview", "MenuItem", "Menu", "Divider", "tabManager"
    ];
    main.provides = ["Previewer"];
    return main;

    function main(options, imports, register) {
        var Plugin    = imports.Plugin;
        var preview   = imports.preview;
        var Menu      = imports.Menu;
        var MenuItem  = imports.MenuItem;
        var Divider   = imports.Divider;
        var tabs      = imports.tabManager;
        
        function Previewer(developer, deps, options){
            var plugin = new Plugin(developer, deps);
            var emit   = plugin.getEmitter();
            emit.setMaxListeners(1000);
            
            var caption  = options.caption;
            var onclick  = options.onclick;
            var submenu  = options.submenu;
            var divider  = options.divider;
            var selector = options.selector || function(){ return false; };
            var index    = options.index || 100;
            var menu, item, div;
            
            var currentSession, currentDocument;
            
            plugin.on("load", function(){
                preview.register(plugin, selector);
                
                var rootMenu = preview.previewMenu;
                
                item = rootMenu.append(new MenuItem({ 
                    caption  : caption, 
                    position : index
                }));
                
                if (onclick || !submenu)
                    item.on("click", onclick || function(){
                        var editor = tabs.focussedTab.editor;
                        editor.setPreviewer(plugin.name);
                    });
                    
                if (submenu) {
                    item.submenu = menu = submenu instanceof Menu
                        ? submenu : new Menu({}, plugin);
                }
                
                if (divider)
                    div = rootMenu.append(new Divider({ position: index + 10 }));
            });
            
            /***** Methods *****/
            
            function loadDocument(doc, editor, state){
                emit("documentLoad", { doc: doc, editor: editor, state: state });
            }
            
            function unloadDocument(doc){
                emit("documentUnload", { doc: doc });
            }
            
            function activateDocument(doc){
                if (currentDocument)
                    emit("documentDeactivate", { doc: currentDocument });
                
                currentDocument = doc;
                currentSession  = doc.getSession();
                
                emit("documentActivate", { doc: currentDocument });
            }
            
            function update(e){ emit("update", e); };
            function reload(){ emit("reload"); };
            
            function navigate(e){ 
                var session = currentSession;
                var doc;
                
                // if (session.path == e.url)
                //     return;
                
                if (session.previewTab) {
                    doc = session.previewTab.document;
                    
                    // Remove previous change listener
                    doc.undoManager.off("change", session.changeListener);
                    
                    // Remove previous path listener
                    doc.tab.off("path.set", session.renameListener);
                }
                
                if (!e) return; // For cleanup
                
                // Find new tab
                session.path           = e.url;
                session.previewTab     = e.tab = tabs.findTab(session.path);
                session.changeListener = function(){
                    update({
                        saved: session.previewTab
                            .document.undoManager.isAtBookmark()
                    });
                };
                session.renameListener = function(e){
                    navigate({ url: e.path });
                }
                
                // Set new change listener
                if (session.previewTab) {
                    doc = session.previewTab.document;
                    
                    // Listen to value changes
                    doc.undoManager.on("change", session.changeListener);
                    
                    // Listen to path changes
                    doc.tab.on("setPath", session.renameListener);
                }
                
                emit("navigate", e); 
            };
            
            function getState(doc, state){
                emit("getState", {
                    doc    : doc,
                    state  : state
                });
                
                return state;
            }
            
            function setState(doc, state){
                emit("setState", {
                    doc   : doc,
                    state : state || {}
                });
            }
            
            function focus(regain, lost){
                emit("focus", {
                    regain : regain || false,
                    lost   : lost || false
                });
            }
            
            function blur(){
                emit("blur");
            }
            
            /***** Register and define API *****/
            
            plugin.freezePublicAPI.baseclass();
            
            /**
             * Previewer base class for the {@link Preview Cloud9 preview pane}.
             * 
             * A debug panel is a section of the debugger that allows users to
             * interact with the debugger. Debuggers in Cloud9 are pluggable
             * and there are many different debuggers available as a 
             * {@link debugger.implementation debugger implementation}.
             * 
             * The debugger UI is re-used for all these debugger 
             * implementations. Panels can decide for which debugger they should
             * be shown:
             * 
             *     var debug = imports.debugger;
             *     
             *     debug.on("attach", function(e){
             *         if (e.implementation.type == "html5")
             *             plugin.show();
             *         else
             *             plugin.hide();
             *     });
             * 
             * Implementing your own debug panel takes a new Previewer() object 
             * rather than a new Plugin() object. Here's a short example:
             * 
             *     var plugin = new Previewer("(Company) Name", main.consumes, {
             *         caption  : "Cool Caption"
             *     });
             *     var emit = plugin.getEmitter();
             * 
             *     plugin.on("draw", function(e){
             *         e.html.innerHTML = "Hello World!";
             *     });
             *     
             *     plugin.freezePublicAPI({
             *     });
             * 
             * @class Previewer
             * @extends Plugin
             */
            /**
             * @constructor
             * Creates a new Previewer instance.
             * @param {String}   developer   The name of the developer of the plugin
             * @param {String[]} deps        A list of dependencies for this 
             *   plugin. In most cases it's a reference to `main.consumes`.
             * @param {Object}   options     The options for the debug panel
             * @param {String}   options.caption  The caption of the frame.
             */
            plugin.freezePublicAPI({
                /**
                 * 
                 */
                get menu(){ return menu; },
                get item(){ return item; },
                get divider(){ return div; },
                
                get activeDocument(){ return currentDocument; },
                get activeSession(){ return currentSession; },
                
                _events : [
                    /** 
                     * Fires when a document is loaded into the previewer.
                     * This event is also fired when this document is attached to another
                     * instance of the same previewer (in a split view situation). Often you
                     * want to keep the session information partially in tact when this
                     * happens.
                     * @event documentLoad 
                     * @param {Object}   e
                     * @param {Document} e.doc     the document that is loaded into the previewer
                     * @param {Object}   e.state   state that was saved in the document
                     * @param {Editor}   e.editor  the instance of the {@link Preview} editor
                     */
                    "documentLoad",
                    /** 
                     * Fires when a document becomes the active document of a previewer
                     * This event is called every time a tab becomes the active tab of
                     * a pane. Use it to show / hide whatever is necessary.
                     * 
                     * @event documentActivate
                     * @param {Object}   e
                     * @param {Document} e.doc  the document that is activate
                     */
                    "documentActivate",
                    /**
                     * Fires when a document stops being the active document of a previewer
                     * This event is called every time a tab stops being the active tab of
                     * a pane. Use it to show / hide whatever is necessary.
                     * 
                     * @event documentActivate
                     * @param {Object}   e
                     * @param {Document} e.doc  the document that is activate
                     */
                    "documentDeactivate",
                    /**
                     * Fires when a document is unloaded from the previewer.
                     * This event is also fired when this document is attached to another
                     * instance of the previewer (in a split view situation).
                     * @event documentUnload
                     * @param {Object}   e
                     * @param {Document} e.doc  the document that was loaded into the previewer
                     */
                    "documentUnload",
                    /** 
                     * Fires when the state of the previewer is retrieved
                     * @event getState
                     * @param {Object}   e
                     * @param {Document} e.doc    the document for which the state is retrieved
                     * @param {Object}   e.state  the state to add values to {See #getState}
                     */
                    "getState",
                    /** 
                     * Fires when the state of the previewer is set
                     * @event setState
                     * @param {Object}   e
                     * @param {Document} e.doc    the document for which the state is set
                     * @param {Object}   e.state  the state that is being set
                     */
                    "setState",
                    /** 
                     * Fires when the previewer gets the focus. See also 
                     * {@link tabs#focusTab}, {@link tabs#focussedTab}
                     * @event focus
                     * @param {Object}  e
                     * @param {Boolean} e.regain whether the focus is regained. 
                     *   This means that the previewer had lost the focus 
                     *   previously (the focus event with e.lost set to true 
                     *   was called.) and now the focus has been given back to 
                     *   the tabs.
                     * @param {Boolean} e.lost   whether the focus is lost, 
                     *   while the previewer remains the focussed previewer. This 
                     *   happens when an element outside of the previewers 
                     *   (for instance the tree or a menu) gets the focus.
                     */
                    "focus",
                    /** 
                     * Fires when the previewer looses focus.
                     * @event blur
                     */
                    "blur",
                    
                    "update",
                    "reload",
                    "navigate",
                ],
                    
                /**
                 * Unloads the document from this editor.
                 * @private
                 */
                unloadDocument : unloadDocument,
                
                /**
                 * Loads the document in this editor to be displayed.
                 * @param {Document} doc the document to display
                 */
                loadDocument : loadDocument,
                
                /**
                 * Sets the focus to this editor
                 */
                focus : focus,

                /**
                 * Removes the focus from this editor
                 */
                blur : blur,
                
                /**
                 * 
                 */
                activateDocument : activateDocument,
                
                /**
                 * 
                 */
                update : update,
                
                /**
                 * 
                 */
                reload : reload,
                
                /**
                 * 
                 */
                navigate : navigate,
                
                /**
                 * 
                 */
                getState : getState,
                
                /**
                 * 
                 */
                setState : setState
            });
            
            return plugin;
        }
        
        /***** Register and define API *****/
        
        register(null, {
            Previewer: Previewer
        })
    }
});