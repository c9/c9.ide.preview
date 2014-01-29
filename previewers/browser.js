define(function(require, exports, module) {
    main.consumes = [
        "Previewer", "preview", "vfs", "c9", "tabManager", "watcher", "fs"
    ];
    main.provides = ["preview.browser"];
    return main;

    function main(options, imports, register) {
        var Previewer   = imports.Previewer;
        var tabManager  = imports.tabManager;
        var c9          = imports.c9;
        var fs          = imports.fs;
        var preview     = imports.preview;
        var watcher     = imports.watcher;
        
        var join        = require("path").join;
        var dirname     = require("path").dirname;
        
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
        var HTMLURL = (options.htmlurl || "/static/plugins/c9.ide.preview/previewers/markdown.html")
            
        if (HTMLURL[0] == "/")
            HTMLURL = location.protocol + "//" + location.host + HTMLURL;

        var counter       = 0;
        var previewOrigin = HTMLURL.match(/^(?:[^\/]|\/\/)*/)[0];
        
        /***** Methods *****/
        
        function calcRootedPath(url){
            if (url.substr(0, BASEPATH.length) == BASEPATH)
                return url.substr(BASEPATH.length);
            return url;
        }
        
        function initiate(session){
            // Add watchers to all styles and scripts and href
            [session.href].concat(session.styles, session.scripts).forEach(function(path){
                watcher.watch(path);
            });
            
            // Attach to open tabs
            tabManager.getTabs().forEach(function(tab){
                if (!tab.path) return;
                initDocument({ tab: tab, path: tab.path });
            }, session);
            
            if (session.inited)
                return;
            
            session.inited = true;
            
            watcher.on("delete", function(e){
                var info = isKnownFile(e.path);
                if (info) {
                    info.del = true;
                    update(null, info);
                }
            }, session);
            
            watcher.on("change", function(e){
                var info = isKnownFile(e.path);
                if (info) {
                    var tab = tabManager.findTab(e.path);
                    if (tab)
                        update(tab.document, info);
                    else {
                        fs.readFile(e.path, function(err, data){
                            update({ value: data }, info);
                        });
                    }
                }
            }, session);
            
            // Listen for opening files
            tabManager.on("open", initDocument, session);
            
            function initDocument(e){
                var info = isKnownFile(e.path);
                if (info) {
                    var doc = e.tab.document;
                    
                    doc.undoManager.on("change", 
                        update.bind(null, doc, info), session);
                    
                    e.tab.on("close", function(){
                        watcher.watch(e.tab.path);
                    });
                    
                    if (doc.changed)
                        update(doc, info);
                }
            }
            
            function update(doc, info){
                var message = {
                    id      : session.id,
                    type    : "update",
                    url     : info.url,
                    del     : info.del
                };
                if (info.type)
                    message[info.type] = doc.value;
                session.source.postMessage(message, "*");
            }
            
            function isKnownFile(path){
                var found;
                
                if (~session.href.indexOf(path))
                    return { url: session.href, type: "html" }
                
                function search(arr, type) {
                    if (arr.some(function(p){
                        if (~p.indexOf(path)) {
                            found = p;
                            return true;
                        }
                    })) {
                        return { url: found, type: type }
                    }
                }
                
                return search(session.styles, "css")
                    || search(session.scripts, "code");
            }
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
            // iframe.setAttribute("nwfaketop", true);
            iframe.setAttribute("nwdisable", true);
            
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
                
                if (options.local)
                    plugin.activeSession.add(iframe.contentWindow.location.href);
                
                editor.setLocation(path);
                tab.className.remove("loading");
            });
            
            window.addEventListener("message", function(e) {
                if (c9.hosted && event.origin !== previewOrigin)
                    return;
                
                if (session.id != e.data.id)
                    return;
                
                if (e.data.message == "html.ready") {
                    session.source = e.source;
                    
                    var data = e.data.data;
                    session.styles  = data.styles;
                    session.scripts = data.scripts;
                    session.href    = data.href;
                    
                    initiate(session);
                }
            }, false);
            
            session.id     = "livepreview" + counter++;
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
            var tab     = plugin.activeDocument.tab;
            var session = plugin.activeSession;
            var iframe  = session.iframe;
            var url = e.url.match(/^[a-z]\w{1,4}\:\/\//)
                ? e.url
                : BASEPATH + e.url;
            session.url = url;
            
            tab.className.add("loading");
            iframe.src = url + (~url.indexOf("?") ? "&" : "?")
                + "id=" + session.id
                + "&host=" + (options.local ? "local" : location.origin);
            
            var path = calcRootedPath(url);
            tab.title   = 
            tab.tooltip = "[B] " + path;
            plugin.activeSession.editor.setLocation(path);
        });
        plugin.on("update", function(e){
            // var iframe = plugin.activeSession.iframe;
            // if (e.saved)
            //     iframe.src = iframe.src;
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