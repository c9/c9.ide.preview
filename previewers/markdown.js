define(function(require, exports, module) {
    main.consumes = ["c9", "Previewer"];
    main.provides = ["preview.markdown"];
    return main;

    // @todo possible improvements: http://benweet.github.io/stackedit/#

    function main(options, imports, register) {
        var Previewer = imports.Previewer;
        var c9        = imports.c9;
        
        /***** Initialization *****/
        
        var plugin = new Previewer("Ajax.org", main.consumes, {
            caption  : "Markdown",
            index    : 200,
            selector : function(path){
                return path.match(/(?:\.md|\.markdown)$/i);
            }
        });
        
        var HTMLURL = (options.htmlurl || "/static/plugins/c9.ide.preview/previewers/markdown.html")
            + "?host=" + location.origin;
            
        if (HTMLURL[0] == "/")
            HTMLURL = location.protocol + "//" + location.host + HTMLURL;

        var previewOrigin = HTMLURL.match(/^(?:[^\/]|\/\/)*/)[0];
        
        /***** Methods *****/
        
        /***** Lifecycle *****/
        
        plugin.on("load", function(){
            
        });
        plugin.on("documentLoad", function(e){
            var doc     = e.doc;
            var session = doc.getSession();
            var tab     = doc.tab;
            var editor  = e.editor;
            
            var iframe = document.createElement("iframe");
            
            iframe.setAttribute("nwfaketop");
            iframe.setAttribute("nwdisable");

            iframe.style.width    = "100%";
            iframe.style.height   = "100%";
            iframe.style.border   = 0;
            iframe.style.backgroundColor = "rgba(255, 255, 255, 0.88)";
            
            window.addEventListener("message", function(e) {
                if (c9.hosted && event.origin !== previewOrigin)
                    return;
                
                if (e.data.message == "stream.document") {
                    session.source = e.source;
                    session.source.postMessage({
                        type    : "document",
                        content : session.previewTab.document.value
                    }, location.origin);
                    
                    tab.className.remove("loading");
                }
            }, false);
            session.iframe = iframe;
            
            // Load the markup renderer
            iframe.src = HTMLURL;
            
            session.editor = editor;
            editor.container.appendChild(session.iframe);
        });
        plugin.on("documentUnload", function(e){
            var doc     = e.doc;
            var session = doc.getSession();
            var iframe  = session.iframe;
            iframe.parentNode.removeChild(iframe);
            
            if (session.onchange)
                session.pdoc.undoManager.off("change", session.onchange);
            
            doc.tab.className.remove("loading");
        });
        plugin.on("documentActivate", function(e){
            var session = e.doc.getSession();
            
            session.iframe.style.display = "block";
            session.editor.setLocation(session.path);
            session.editor.setButtonStyle("Markdown", "page_white.png");
        });
        plugin.on("documentDeactivate", function(e){
            var session = e.doc.getSession();
            session.iframe.style.display = "none";
        });
        plugin.on("navigate", function(e){
            var tab    = plugin.activeDocument.tab;
            var iframe = plugin.activeSession.iframe;
            var editor = plugin.activeSession.editor;
            
            tab.className.add("loading");
            
            tab.title    = 
            tab.tooltip  = "[M] " + e.url;
            editor.setLocation(e.url);
            
            iframe.src = iframe.src;
        });
        plugin.on("update", function(e){
            var session = plugin.activeSession;
            if (!session.source) return; // Renderer is not loaded yet
    
            session.source.postMessage({
                type    : "document",
                content : e.previewDocument.value
            }, location.origin);
        });
        plugin.on("reload", function(){
            var iframe = plugin.activeSession.iframe;
            var tab    = plugin.activeDocument.tab;
            tab.className.add("loading");
            iframe.src = iframe.src;
        });
        plugin.on("enable", function(){
            
        });
        plugin.on("disable", function(){
            
        });
        plugin.on("unload", function(){
        });
        
        /***** Register and define API *****/
        
        /**
         * Previewer for markdown content.
         **/
        plugin.freezePublicAPI({
        });
        
        register(null, {
            "preview.markdown": plugin
        });
    }
});