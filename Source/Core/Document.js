define([
    './Constants/Error',
    './Controller/ErrorHandler',
    './Constants/Global',
    './Service/ViewingService',
    './Logger',
    './Inits',
    './Loader/LeafletLoader'
], function(Error, ErrorHandler, Global, ViewingService, Logger, Inits, LeafletLoader) {
    'use strict';

    var refreshRequestHeader = Inits.refreshRequestHeader,
        initLoadContext = Inits.initLoadContext;
    /**
     * Document
     *
     *  This is the core model data class for all items and collections.
     *  It allows the client to load the model data from the cloud, it
     *  gives access to the root and provides a method for finding elements
     *  by id.
     *
     *  Typically, you load the document from the Viewing Service, parse it for
     *  the required content (for example, 3d geometries), then pass this on to
     *  the viewer to display.  You can also get some information about the document,
     *  such as the number of views it contains and its thumbnail image.
     *
     * You can view the json structure of a Document object by requesting it from
     * the viewing service, once you have been authenticated (eg a valid accessToken
     * is stored as a cookie):
     * https://viewing-dev.api.autodesk.com/viewingservice/v1/bubbles/[urn]
     *
     * @class
     * @memberof Autodesk.Viewing
     * @alias Autodesk.Viewing.Document
     *
     *  @param {Object} dataJSON - json data representing the document
     *  @param {string} path - path to the document
     *  @param {string} acmsession - acm session id
     */
    var Document = function (dataJSON, path, acmsession) {
        this.myPath = path;
        this.myData = dataJSON;
        this.myViewGeometry = {};
        this.myNumViews = {};
        this.myPropertyDb = null;
        this.acmSessionId = acmsession;

        // Search bubble for type="view" role="3d" children of type="geometry" role="3d" items.
        // Add count of view-3d items to parent geometry-3d items.
        // Collect geometry items of camera view items referenced by guid.
        //
        var self = this;

        function annotateViews(item) {
            if (!item) {
                return;
            }

            var childCount = item.children ? item.children.length : 0;
            var i;

            if (item.type === "geometry" && childCount) {
                var viewCount = 0;
                for (i = 0; i < childCount; i++) {
                    var child = item.children[i];
                    if (child && child.type === "view") {
                        self.myViewGeometry[child.guid] = item;
                        viewCount++;
                    }
                }

                self.myNumViews[item.guid] = viewCount;

            } else if (item.mime == "application/autodesk-db" && item.urn) {
                //If there is a shared property database, remember its location

                //Of course, OSS is a storage system that mangles paths because why not,
                //so it needs special handling to extract the property database path
                if (item.urn.indexOf(ViewingService.OSS_PREFIX) === 0)
                    self.myPropertyDb = item.urn.substr(0, item.urn.lastIndexOf("%2F") + 3);
                else
                    self.myPropertyDb = item.urn.substr(0, item.urn.lastIndexOf("/") + 1);

            } else if (0 < childCount) {
                for (i = 0; i < childCount; i++) {
                    annotateViews(item.children[i]);
                }
            }
        }
        annotateViews(dataJSON);

        // Traverse the document and populate the parent pointers (for each node, store its parent).
        //
        function traverse(item) {
            if (!item)
                return;

            var len = item.children ? item.children.length : 0;
            for (var i = 0; i < len; i++) {
                item.children[i].parent = item;
                traverse(item.children[i]);
            }
        }
        traverse(this.myData);
    };

    Document.prototype.constructor = Document;

    /**
     * Static method to load the model data from the cloud.
     *
     *  @example
     *         // Load the model from the cloud
     *         var urn = 'dXJuOmFkc2suczM6ZGVyaXZlZC5maWxlOnRyYW5zbGF0aW9uXzI1X3Rlc3RpbmcvRFdGL0Nhci5kd2Y=';
     *         var seedFile  = "https://viewing-dev.api.autodesk.com/viewingservice/v1/" + urn;
     *         var jsonData = "";
     *         Autodesk.Document.load( seedFile, function( doc ) { jsonData=doc }, function( ) { } );
     *         var model = new Autodesk.Document(jsonData, 'path');
     *         var root  = model.getRootItem(); // top item of the hierarchy of the model data
     *         var item  = model.getItemById( "XXX02UUEs");
     *         var path = model.getFullPath(); // should be 'path'
     *
     *  @param {string} documentId - The cloud urn of the file.
     *  @param {function(object)} onSuccessCallback - A function that is called when load succeeds.
     *  @param {function(int, string)} onErrorCallback - A function that is called when load fails.
     *  @param {Object} [accessControlProperties] - An optional list of key value pairs as access control properties, which includes a list of
     *  access control header name and values, and an OAuth 2.0 access token.
     */
    Document.load = function (documentId, onSuccessCallback, onErrorCallback, accessControlProperties) {

        // The function signature was changed and we removed the need for the Auth parameter
        // Check what the second parameter is if its a non function assign the others correctly
        // this will also work in the case of missing arguments
        if (typeof (arguments[1]) !== 'function') {
            Logger.warn("Document.load called with deprecated (auth) parameter");
            if (typeof (arguments[2]) === 'function') {
                onSuccessCallback = arguments[2];
            }
            if (typeof (arguments[3]) === 'function') {
                onErrorCallback = arguments[3];
            }
        }

        function getDocumentPath(documentId) {
            // Handle local paths explicitly.
            //
            if (documentId.indexOf('urn:') === -1) {

                //Absolute URL
                if (documentId.indexOf("://") !== -1)
                    return documentId;

                var relativePath = documentId;

                if (typeof window !== "undefined") {
                    if (relativePath.indexOf('/') !== 0)
                        relativePath = '/' + relativePath;
                    return window.location.protocol + "//" + window.location.host + relativePath;
                } else {
                    return relativePath;
                }
            }
            return documentId;
        }

        function getViewableCount(modelDocument) {
            var viewableItems = Document.getSubItemsWithProperties(modelDocument.getRootItem(), { 'type': 'folder', 'role': 'viewable' }, true);
            var root = viewableItems[0];
            var geometryItems = Document.getSubItemsWithProperties(root, { 'type': 'geometry' }, true);
            return geometryItems.length;
        }

        function getGlobalMessages(data, nestedKey) {

            var collectedmessages = [];
            var translateFailedCount = 0;
            var translateProgressCount = 0;
            nestedKey = nestedKey || "children";

            var traverse = function (obj) {
                var children = obj[nestedKey] || [];
                var messages = obj.messages || [];

                var errorMessages = messages.filter(function (msg) {
                    return msg.type === 'error';
                });

                if (errorMessages.length > 0) {
                    translateFailedCount += 1;
                }

                if (obj.status === 'inprogress') {
                    translateProgressCount += 1;
                }

                Array.prototype.push.apply(collectedmessages, messages.slice(0));
                for (var i = children.length; i--; traverse(children[i]));
            };

            traverse(data);

            var progress = 'translated';

            progress = translateFailedCount > 0 ? "failed" : progress;
            progress = translateProgressCount > 0 ? 'processing' : progress;

            for (var i = collectedmessages.length; i--; collectedmessages[i].$translation = progress);

            return collectedmessages;

        }

        function doLoad(acmsession) {

            var documentPath = getDocumentPath(documentId);
            var messages;

            function onSuccess(data) {
                var regex = /<[^>]*script/;
                if (regex.test(data)) {
                    if (onErrorCallback)
                        onErrorCallback(Error.ErrorCodes.BAD_DATA, "Malicious document content detected Abort loading");
                    return;
                }

                var items = typeof (data) === 'string' ? JSON.parse(data) : data;
                var lmvDocument = new Document(items, documentPath, acmsession);
                var viewableCount = getViewableCount(lmvDocument);

                // Check if there are any viewables.
                if (viewableCount > 0) {
                    messages = getGlobalMessages(lmvDocument.getRootItem());
                    if (onSuccessCallback) {
                        onSuccessCallback(lmvDocument, messages);
                    }
                }
                else {
                    // If there are no viewables, report an error.
                    //
                    if (onErrorCallback) {
                        messages = getGlobalMessages(lmvDocument.getRootItem());
                        var errorCode = Error.ErrorCodes.BAD_DATA_NO_VIEWABLE_CONTENT;
                        var errorMsg = "No viewable content";
                        onErrorCallback(errorCode, errorMsg, messages);
                    }
                }
            }

            function onFailure(statusCode, statusText, data) {

                // If unauthorized and the first call for loading, will suppose third-party
                // cookies are disabled, and load again with token in request header.
                if (statusCode === 401 && LMV_THIRD_PARTY_COOKIE === undefined) {
                    LMV_THIRD_PARTY_COOKIE = false;
                    refreshRequestHeader(Global.token.accessToken);
                    doLoad(acmsession);
                }
                else {
                    var messages = getGlobalMessages(data);
                    if (onErrorCallback) {
                        var errorMsg = "Error: " + statusCode + " (" + statusText + ")";
                        var errorCode = ErrorHandler.getErrorCode(statusCode);
                        onErrorCallback(errorCode, errorMsg, statusCode, statusText, messages);
                    }
                }
            }

            var msg = {
                queryParams: acmsession ? "acmsession=" + acmsession : ""
            };

            ViewingService.getManifest(initLoadContext(msg), documentPath, onSuccess, onFailure);
        }

        if (accessControlProperties) {
            ViewingService.getACMSession(ACM_SESSION_URL, accessControlProperties, doLoad, onErrorCallback);
        } else {
            doLoad();
        }
    };

    /**
     * This function is only used when Authorization is through Bearer token; aka when cookies are disabled.
     *
     * @param {string} data - See Document.prototype.getThumbnailOptions
     * @param {Function} onComplete - Node style callback function callback (err, response)
     */
    Document.requestThumbnailWithSecurity = function (data, onComplete) {

        var onSuccess = function (response) {
            onComplete(null, response);
        };
        var onFailure = function () {
            onComplete('error', null);
        };

        var options = {
            responseType: 'blob',
            skipAssetCallback: true,
            size: data.width, //Ignore the height, they are the same.
            guid: data.guid
        };

        var urlpath = "urn:" + data.urn; //HACK: Adding urn: makes the ViewingServiceXhr accept this as a viewing service request.
        ViewingService.getThumbnail(initLoadContext(), urlpath, onSuccess, onFailure, options);
    };

    /**
     *  Returns the full path to the given urn.
     *  @param {string} urn - the urn of the document
     *  @returns {string}
     */
    Document.prototype.getFullPath = function (urn) {

        if (!urn)
            return urn;

        var fullPath = urn;

        if (Global.offline) {
            fullPath = decodeURIComponent(Global.offlineResourcePrefix) + fullPath.substr(fullPath.indexOf('/'));
        } else if (urn.indexOf('urn') === 0) {
            // Use viewing service.
            fullPath = VIEWING_URL + "/items/" + urn;
        }
            // Handle local files.
            //
        else if (urn.indexOf('$file$') === 0 && this.myPath.indexOf('/bubble.json') !== -1) {
            fullPath = this.myPath.replace('/bubble.json', '') + urn.replace('$file$', '');
        }
        return fullPath;
    };

    /**
     * Returns a plain Object with properties used to fetch a thumbnail image
     * @param {Object} item
     * @param {Number} width
     * @param {Number} height
     * @returns {{urn: string, width: number, height: number, guid: string, acmsession: (string)}}
     */
    Document.prototype.getThumbnailOptions = function (item, width, height) {
        var requestedWidth = width ? width : 200;
        var requestedHeight = height ? height : 200;
        return {
            urn: this.myData.urn,
            width: requestedWidth,
            height: requestedHeight,
            guid: encodeURIComponent(item.guid),
            acmsession: this.acmSessionId
        }
    };

    /**
     *  Returns the path to the thumbnail of the item with the given id.
     *  @param {string} item - a Document item.
     *  @param {int} width - the requested thumbnail width.
     *  @param {int} height - the requested thumbnail height.
     *  @returns {string}
     */
    Document.prototype.getThumbnailPath = function (item, width, height) {
        var data = this.getThumbnailOptions(item, width, height);
        var ret = VIEWING_URL + "/thumbnails/" + data.urn +
            "?guid=" + data.guid +
            "&width=" + data.width +
            "&height=" + data.height;

        if (data.acmsession) {
            ret += "&acmsession=" + data.acmsession;
        }
        return ret;
    };

    /**
     * Extracts leaflet loader params from an item (if any)
     *  @param {Object} outLoadOptions - extracted params are stored in this object
     *  @param {Object} geomItem       - a geometry item with role '2d' that contains
     *                                   the leaflet resource item.
     *  @param {string}                - the resource item with role 'leaflet' that
     *                                   contains the tile url pattern and some other params.
     */
    function getLeafletParams(outLoadOptions, geomItem, leafletItem) {

        outLoadOptions.urlPattern = leafletItem.urn;
        outLoadOptions.tileSize = leafletItem.tileSize ? leafletItem.tileSize : 512; // currently, bubbles use a fixed tile size of 512.
        outLoadOptions.texWidth = leafletItem.resolution[0];
        outLoadOptions.texHeight = leafletItem.resolution[1];
        outLoadOptions.paperWidth = leafletItem.paperWidth;
        outLoadOptions.paperHeight = leafletItem.paperHeight;
        outLoadOptions.paperUnits = leafletItem.paperUnits;

        // hierarchies produced by cloud translation service start with a 1x1 miplevel at the root. 
        // therefore, we have to skip some levels.
        outLoadOptions.levelOffset = LeafletLoader.computeLevelOffset(outLoadOptions.tileSize);

        // maxLevel is stored in another resource item that references a zip-file with the tile-images.
        // the max_level value includes several levels with just one tile (1x1, 2x2, ...) which we skip.
        var items = Document.getSubItemsWithProperties(geomItem, { 'role': 'leaflet-zip' }, false);
        if (items.length > 0) {
            outLoadOptions.maxLevel = items[0].max_level - outLoadOptions.levelOffset;
        }
    };

    /**
     *  Returns the path to the viewable of the given item.
     *  @param {Object} item             - the item whose viewable is requested.
     *  @param {Object} [outLoadOptions] - output param: used to store some additional loader options. 
     *                                     needed to extract leaflet params from a bubble item.
     *  @returns {string}
     */
    Document.prototype.getViewablePath = function (item, outLoadOptions) {
        if (item.type === 'geometry') {
            var items = [];
            if (item.role === '3d') {
                items = Document.getSubItemsWithProperties(item, {
                    'mime': 'application/autodesk-svf'
                }, false);
            }
            else if (item.role === '2d') {

                // check for a leaflet resource
                items = Document.getSubItemsWithProperties(item, {
                    'role': 'leaflet'
                }, false);

                // found one? => extract its params
                if (items.length > 0 && outLoadOptions) {
                    getLeafletParams(outLoadOptions, item, items[0]);
                };

                // if there is no leaflet...
                if (items.length === 0) {
                    // check for vector and if does not exist for tiles.
                    items = Document.getSubItemsWithProperties(item, {
                        'mime': 'application/autodesk-f2d'
                    }, false);
                }
                // old file does not have f2d yet - so load tile viewer
                if (items.length === 0) {
                    items = Document.getSubItemsWithProperties(item, {
                        'role': 'tileRoot'
                    }, true);
                }
            }
            if (items.length > 0) {
                return this.getFullPath(items[0].urn);
            }
        }
        else if (item.type === 'view') {
            var geometryItem = this.getViewGeometry(item);
            if (geometryItem) {
                return this.getViewablePath(geometryItem);
            }
        }

        return '';
    };

    /**
     * Returns the root path to a shared (across all sheets/views) property database's json files.
     * @returns {string}
     */
    Document.prototype.getPropertyDbPath = function () {
        return this.myPropertyDb;
    };

    /**
     *  Returns the root of the model data hierarchy.
     *  @returns {Object}
     */
    Document.prototype.getRootItem = function () {
        return this.myData;
    };

    /**
     *  Returns the id of this document.
     *  @returns {string}
     */
    Document.prototype.getPath = function () {
        return this.myPath;
    };

    /**
     * Returns an item from the model data hierarchy with the given id.
     * If the item is not found, null object is returned.
     *
     *  @param {string} id  - an id of the item to be found.
     *  @returns {Object} - item with a given id.
     */
    Document.prototype.getItemById = function (id) {
        function traverse(data) {
            if (!data)
                return null;

            for (var key in data) {
                var val = data[key];
                if (key === 'guid' && val === id)
                    return data;

                if (val !== null && typeof (val) === "object" && key !== "parent") {
                    //going on step down in the object tree!!
                    var item = traverse(val);
                    if (item)
                        return item;
                }
            }
            return null;
        }
        return traverse(this.myData);
    };

    /**
     * Static method that returns an array of all items with given properties.
     *
     *  @param {string} item - the document node to begin searching from.
     *  @param {Object} properties - map/list of the properties to search for.
     *  @param {bool} recursive - if true, searches recursively
     *  @returns {Object} - list of items that have given properties.
     *
     *  @example
     *  // search the document starting from the root element for all 2d geometry items
      geometryItems = Document.getSubItemsWithProperties(adocument.getRootItem(), {
                            'type' : 'geometry',
                            'role' : '2d'
                        }, true);
     */
    Document.getSubItemsWithProperties = function (item, properties, recursive) {
        var subItems = [];
        if (!item) return [];

        function hasProperties(item, properties) {
            for (var p in properties) {
                if (!(p in item) || (properties[p] !== item[p]))
                    return false;
            }
            return true;
        }

        var len = item.children ? item.children.length : 0;
        for (var i = 0; i < len; i++) {
            // Check if this child has this key and value.
            //
            var child = item.children[i];
            if (hasProperties(child, properties)) {
                subItems.push(child);
            }

            // Search the descendants if requested.
            //
            if (recursive) {
                subItems.push.apply(subItems, Document.getSubItemsWithProperties(child, properties, recursive));
            }
        }
        return subItems;
    };

    /**
     * Return the parent geometry item for a given view item
     * @param {Object} item - view item
     * @returns {Object} The parent geometry item
     */
    Document.prototype.getViewGeometry = function (item) {
        return this.myViewGeometry[item.guid];
    };

    /**
     * Return the number of view items underneath a geometry item.
     * @param {Object} item - geometry item
     * @returns {number} The number of view items underneath the geometry item.
     */
    Document.prototype.getNumViews = function (item) {
        return this.myNumViews[item.guid] || 0;
    };

    /**
     * @deprecated Simply use item.parent instead.
     * Return parent ID of the given document node ID.
     * @param {string} item - the node ID.
     * @returns {string}
     */
    Document.prototype.getParentId = function (itemId) {
        var item = this.getItemById(itemId);
        if (!item)
            return null;
        var parent = item.parent;
        return parent ? parent.guid : null;
    };


    /**
     * Return messages (error and warning messages) associated with a given item. It includes
     * item's messages as well as messages of all its parents.
     *
     * @param {string} itemId - guid of the item.
     * @param {bool} - if true the top messages that apply to the whole file are excluded.
     * @returns {Object} - returns an array of messages.
     */
    Document.prototype.getMessages = function (item, excludeGlobal) {

        var messages = [];
        if (!item)
            return messages;

        var root = null;
        if (excludeGlobal)
            root = this.getRootItem();

        var current = item;
        while (current) {

            if (excludeGlobal && parent === root)
                break;

            if (current.messages) {
                for (var i = 0; i < current.messages.length; i++) {
                    messages.push(current.messages[i]);
                }
            }
            current = current.parent;
        }
        return messages;
    };

    return Document;
});