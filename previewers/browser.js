define(function(require, exports, module) {
    main.consumes = ["Previewer", "preview", "layout", "vfs"];
    main.provides = ["preview.browser"];
    return main;

    function main(options, imports, register) {
        var Previewer   = imports.Previewer;
        var layout      = imports.layout;
        var preview     = imports.preview;
        
        /***** Initialization *****/
        
        var plugin = new Previewer("Ajax.org", main.consumes, {
            caption  : "Browser",
            index    : 10,
            divider  : true,
            selector : function(path){
                return path.match(/(?:\.html|\.htm|\.xhtml)$|^https?\:\/\//);
            }
        });
        
        var BASEPATH = preview.previewUrl;
        
        /***** Methods *****/
        
        function calcRootedPath(url){
            if (url.substr(0, BASEPATH.length) == BASEPATH)
                return url.substr(BASEPATH.length);
            return url;
        }
        
        /***** Lifecycle *****/
        
        plugin.on("load", function(){
        });
        plugin.on("documentLoad", function(e){
            var doc     = e.doc;
            var session = doc.getSession();
            var tab     = doc.tab;
            var editor  = e.editor;
            
            var iframe = document.createElement("iframe");
            iframe.style.width    = "100%";
            iframe.style.height   = "100%";
            iframe.style.border   = 0;
            iframe.style.backgroundColor = "rgba(255, 255, 255, 0.88)";
            
            iframe.addEventListener("load", function(){
                if (!iframe.src) return;
                
                var path = calcRootedPath(iframe.src);
                
                tab.title   = 
                tab.tooltip = "[B] " + path;
                session.lastSrc  = iframe.src;
                
                editor.setLocation(path);
                tab.className.remove("loading");
            });
            session.iframe = iframe;
            
            session.editor = editor;
            editor.container.appendChild(session.iframe);
        });
        plugin.on("documentUnload", function(e){
            var doc    = e.doc;
            var iframe = doc.getSession().iframe;
            iframe.parentNode.removeChild(iframe);
            
            doc.tab.className.remove("loading");
        });
        plugin.on("documentActivate", function(e){
            var session = e.doc.getSession();
            var path = calcRootedPath(session.iframe.src);
            
            session.iframe.style.display = "block";
            session.editor.setLocation(path);
            session.editor.setButtonStyle("Browser", "page_white.png");
        });
        plugin.on("documentDeactivate", function(e){
            var session = e.doc.getSession();
            session.iframe.style.display = "none";
        });
        plugin.on("navigate", function(e){
            var tab    = plugin.activeDocument.tab;
            var iframe = plugin.activeSession.iframe;
            var url = e.url.match(/^[a-z]\w{1,4}\:\/\//)
                ? e.url
                : BASEPATH + e.url;
            
            tab.className.add("loading");
            iframe.src = url;
            
            var path = calcRootedPath(url);
            tab.title   = 
            tab.tooltip = "[B] " + path;
            plugin.activeSession.editor.setLocation(path);
        });
        plugin.on("update", function(e){
            var iframe = plugin.activeSession.iframe;
            if (e.saved)
                iframe.src = iframe.src;
        });
        plugin.on("reload", function(){
            var iframe = plugin.activeSession.iframe;
            var tab    = plugin.activeDocument.tab;
            tab.className.add("loading");
            iframe.src = iframe.src;
        });
        plugin.on("popout", function(){
            var src = plugin.activeSession.iframe.src;
            window.open(src);
        });
        plugin.on("enable", function(){
            
        });
        plugin.on("disable", function(){
            
        });
        plugin.on("unload", function(){
        });
        
        /***** Register and define API *****/
        
        /**
         * Previewer for content that the browser can display natively.
         **/
        plugin.freezePublicAPI({
            
        });
        
        register(null, {
            "preview.browser": plugin
        });
    }
});