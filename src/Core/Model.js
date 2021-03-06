define([
    './ModelUnits',
    './EventDispatcher',
    './Logger'
], function(ModelUnits, EventDispatcher, Logger) {
    'use strict';

    /**
     * This is the core class to represent the geometry.
     * @class
     * @alias Autodesk.Viewing.Model
     */
    var Model = function (modelData) {
        this.myData = modelData;

        this.sharedPath = null;
        this.propWorker = null;
    };


    EventDispatcher.prototype.apply(Model.prototype);
    Model.prototype.constructor = Model;

    /**
     * Set the geometry data.
     *  @param {Object} data - data that represents the geometry.
     */
    Model.prototype.setData = function (data) {
        this.myData = data;
    };

    /**
     * Returns the geometry data.
     */
    Model.prototype.getData = function () {
        return this.myData;
    };

    /**
     * Returns an object wrapping the bubble/manifest entry for the
     * loaded geometry. Contains data such as the viewableID, guid, role...
     */
    Model.prototype.getDocumentNode = function () {
        if (this.myData.loadOptions) {
            return this.myData.loadOptions.bubbleNode || null;
        }
        return null;
    };

    /**
     * Returns the root of the geometry node graph.
     *
     * @returns {Object?} - The root of the geometry node graph. Null if it doesn't exist.
     */
    Model.prototype.getRoot = function () {
        if (this.myData && this.myData.instanceTree)
            return this.myData.instanceTree.root;
        return null;
    };

    /**
     * Returns the root of the geometry node graph.
     *
     * @returns {Number?} - The ID of the root or null if it doesn't exist.
     */
    Model.prototype.getRootId = function () {
        if (this.myData && this.myData.instanceTree)
            return this.myData.instanceTree.getRootId();
        return 0;
    };


    /**
    * Returns the bounding box of the model.
    */
    Model.prototype.getBoundingBox = function () {
        if (this.myData)
            return this.myData.bbox;
        return null;
    };


    /**
     * Returns the scale factor of model's distance unit to meters.
     *
     * @returns {Number} - The scale factor of the model's distance unit to meters or unity if the units aren't known.
     */
    Model.prototype.getUnitScale = function () {
        var unit;

        if (!this.is2d()) {
            unit = this.getMetadata('distance unit', 'value', null);
        }
        else {
            unit = this.getMetadata('page_dimensions', 'page_units', null);
        }

        if (unit)
            unit = unit.toLowerCase();

        //Why are translators not using standard strings for those?!?!?!?
        switch (unit) {
            case 'meter':
            case 'meters':
            case 'm': return 1.0;
            case 'feet and inches':
            case 'foot':
            case 'feet':
            case 'ft': return 0.3048;
            case 'inch':
            case 'inches':
            case 'in': return 0.0254;
            case 'centimeter':
            case 'centimeters':
            case 'cm': return 0.01;
            case 'millimeter':
            case 'millimeters':
            case 'mm': return 0.001;
            default: return 1.0;
        }
    };

    /**
     * Returns a standard string representation of the model's distance unit.
     *
     * @returns {String?} - Standard representation of model's unit distance or null if it is not known.
     */
    Model.prototype.getUnitString = function () {

        var unit;

        if (!this.is2d()) {
            // Check if there's an overridden model units in bubble.json (this happens in Revit 3D files)
            if (this.myData && this.myData.overriddenUnits) {
                unit = this.myData.overriddenUnits;
            }
            else {
                unit = this.getMetadata('distance unit', 'value', null);
            }
        }
        else {
            //We use paper units instead of model units here, because in 2D we measure in paper space
            //in the first place, then get the distance in model space by using the viewport(scale).
            unit = this.getMetadata('page_dimensions', 'page_units', null);
        }

        if (unit)
            unit = unit.toLowerCase();

        //Why are translators not using standard strings for those?!?!?!?
        switch (unit) {
            case 'meter':
            case 'meters':
            case 'm': return ModelUnits.METER;
            case 'feet and inches':
            case 'foot':
            case 'feet':
            case 'ft': return ModelUnits.FOOT;
            case 'inch':
            case 'inches':
            case 'in': return ModelUnits.INCH;
            case 'centimeter':
            case 'centimeters':
            case 'cm': return ModelUnits.CENTIMETER;
            case 'millimeter':
            case 'millimeters':
            case 'mm': return ModelUnits.MILLIMETER;
            default: return null;
        }
    };

    /**
     * Returns a standard string representation of the model's display unit.
     *
     * @returns {String?} - Standard representation of model's display unit or null if it is not known.
    */
    Model.prototype.getDisplayUnit = function () {
        var unit;

        if (!this.is2d()) {

            unit = this.getMetadata('distance unit', 'value', null);
        }
        else {

            // When model units is not set, it should be assumed to be the same as paper units.
            unit = this.getMetadata('page_dimensions', 'model_units', null) || this.getMetadata('page_dimensions', 'page_units', null);
        }

        if (unit)
            unit = unit.toLowerCase();

        //Why are translators not using standard strings for those?!?!?!?
        switch (unit) {
            case 'meter':
            case 'meters':
            case 'm': return ModelUnits.METER;
            case 'feet and inches':
            case 'foot':
            case 'feet':
            case 'ft': return ModelUnits.FOOT;
            case 'inch':
            case 'inches':
            case 'in': return ModelUnits.INCH;
            case 'centimeter':
            case 'centimeters':
            case 'cm': return ModelUnits.CENTIMETER;
            case 'millimeter':
            case 'millimeters':
            case 'mm': return ModelUnits.MILLIMETER;
            default: return null;
        }
    };

    /**
     * Return metadata value.
     * @param {string} itemName - metadata item name
     * @param {string=} [subitemName] - metadata subitem name
     * @param {*} [defaultValue] - default value
     * @returns {*} metadata value, or defaultValue if no metadata or metadata item/subitem does not exist
     */
    Model.prototype.getMetadata = function (itemName, subitemName, defaultValue) {
        if (this.myData) {
            var metadata = this.myData.metadata;
            if (metadata) {
                var item = metadata[itemName];
                if (item !== undefined) {
                    if (subitemName) {
                        var subitem = item[subitemName];
                        if (subitem !== undefined) {
                            return subitem;
                        }
                    } else {
                        return item;
                    }
                }
            }
        }
        return defaultValue;
    };

    /*
    Model.prototype.displayMetadata = function () {
        Logger.log('metadata:');
        if (this.myData) {
            var metadata = this.myData.metadata;
            if (metadata) {
                for (itemName in metadata) {
                    if (metadata.hasOwnProperty(itemName)) {
                        Logger.log('  ' + itemName);
                        var item = metadata[itemName];
                        if (item) {
                            for (subItemName in item) {
                                if (item.hasOwnProperty(subItemName)) {
                                    Logger.log('    ' + subItemName + '=' + JSON.stringify(item[subItemName]));
                                }
                            }
                        }
                    }
                }
            }
        }
    };
    */

    /**
     * Returns the default camera.
     */
    Model.prototype.getDefaultCamera = function () {

        var myData = this.myData;

        if (!myData)
            return null;

        var defaultCamera = null;
        var numCameras = myData.cameras ? myData.cameras.length : 0;
        if (0 < numCameras) {
            // Choose a camera.
            // Use the default camera if specified by metadata.
            //
            var defaultCameraIndex = this.getMetadata('default camera', 'index', null);
            if (defaultCameraIndex !== null && myData.cameras[defaultCameraIndex]) {
                defaultCamera = myData.cameras[defaultCameraIndex];

            } else {

                // No default camera. Choose a perspective camera, if any.
                //
                for (var i = 0; i < numCameras; i++) {
                    var camera = myData.cameras[i];
                    if (camera.isPerspective) {
                        defaultCamera = camera;
                        break;
                    }
                }

                // No perspective cameras, either. Choose the first camera.
                //
                if (!defaultCamera) {
                    defaultCamera = myData.cameras[0];
                }
            }
        }

        return defaultCamera;
    };

    /**
     * Returns up vector as an array of 3
     */
    Model.prototype.getUpVector = function () {
        return this.getMetadata('world up vector', 'XYZ', null);
    };

    /**
     * Returns the polygon count.
     * @returns {?number}
     */
    Model.prototype.geomPolyCount = function () {

        if (!this.myData)
            return null;

        return this.myData.geomPolyCount;
    };

    /**
     * Returns the instanced polygon count.
     * @returns {?number}
     */
    Model.prototype.instancePolyCount = function () {

        if (!this.myData)
            return null;

        return this.myData.instancePolyCount;
    };


    /**
     * Returns the root of the layers tree.
     *
     * Not yet implemented in 3D.
     *
     * @returns {?Object} - The root of the layers tree or null if it doesn't exist.
     */
    Model.prototype.getLayersRoot = function () {
        if (!this.is2d()) {
            Logger.warn("Autodesk.Viewing.Model.getLayersRoot is not yet implemented for 3D");
            return null;
        }

        return this.myData ? this.myData.layersRoot : null;
    };

    /**
     * Returns true if the model represents a 2D drawings, false otherwise.
     * @returns {boolean}
     */
    Model.prototype.is2d = function () {

        return !!(this.myData && this.myData.is2d);
    };

    /**
     * Returns true if the model with all its geometries has loaded.
     * @returns {boolean}
     */
    Model.prototype.isLoadDone = function () {
        return !!(this.myData && this.myData.loadDone);
    };

    /**
     * Returns true if the frag to node id mapping is done.
     *
     * @returns {boolean}
     */
    Model.prototype.isObjectTreeCreated = function () {

        return !!(this.myData.instanceTree);

    };


    /**
     * Returns object properties.
     *
     *  @param {int} dbId - id of the node to return the properties for.
     *  @param {function} onSuccessCallback - this method that is called when request for property db succeeds.
     *  @param {function} onErrorCallback - this method that is called when request for property db fails.
     */
    Model.prototype.getProperties = function (dbId, onSuccessCallback, onErrorCallback) {
        if (!this.myData || !this.myData.propWorker)
            return;

        // Negative dbIds will not have properties.
        // Negative dbIds are either paper (-1) or generated ids for 2d-texts
        // dbIds start at 1, so 0 can be skipped as well.
        if (dbId > 0) {
            this.myData.propWorker.getProperties(dbId, onSuccessCallback, onErrorCallback);
        }
    };

    /**
     * Returns properties for multiple objects with an optional filter on which properties to retrieve.
     *
     *  @param {int[]} dbIds - ids of the nodes to return the properties for.
     *  @param {string[]?} propFilter -- Array of property names to return values for. Use null for no filtering.
     *                                   Filter applies to "name" and "externalId" fields also.
     *  @param {function} onSuccessCallback - this method that is called when request for property db succeeds.
     *  @param {function} onErrorCallback - this method that is called when request for property db fails.
     */
    Model.prototype.getBulkProperties = function (dbIds, propFilter, onSuccessCallback, onErrorCallback) {
        if (!this.myData || !this.myData.propWorker)
            return;

        this.myData.propWorker.getBulkProperties(dbIds, propFilter, onSuccessCallback, onErrorCallback);
    };


    /**
     * Returns an object with key values being dbNodeIds and values externalIds.
     * Useful to map LMV node ids to Fusion node ids.
     *
     *  @param {function} onSuccessCallback - this method that is called when request for property db succeeds.
     *  @param {function} onErrorCallback - this method that is called when request for property db fails.
     */
    Model.prototype.getExternalIdMapping = function (onSuccessCallback, onErrorCallback) {
        if (!this.myData)
            return;

        this.myData.propWorker.getExternalIdMapping(onSuccessCallback, onErrorCallback);
    };

    /**
     * Returns object tree.
     *
     *  @param {function} onSuccessCallback - this method that is called when request for object tree succeeds.
     *  @param {function} onErrorCallback - this method that is called when request for object tree fails.
     */
    Model.prototype.getObjectTree = function (onSuccessCallback, onErrorCallback) {
        if (!this.myData || !this.myData.propWorker) {
            if (onErrorCallback) {
                onErrorCallback();
            }
        } else {
            this.myData.propWorker.getObjectTree(onSuccessCallback, onErrorCallback);
        }
    };

    /**
     * Searches the object property database.
     *
     *  @param {string} text - the search term.
     *  @param {function} onSuccessCallback - this method that is called when request for search succeeds.
     *  @param {function} onErrorCallback - this method that is called when request for search fails.
     *  @param {string[]} [attributeNames] - restricts search to specific attribute names
     */
    Model.prototype.search = function (text, onSuccessCallback, onErrorCallback, attributeNames) {
        var self = this;
        if (this.isLoadDone()) {
            this.myData.propWorker.searchProperties(text, attributeNames, onSuccessCallback, onErrorCallback);
        } else {
            this.getObjectTree(function () {
                self.myData.propWorker.searchProperties(text, attributeNames, onSuccessCallback, onErrorCallback);
            });
        }

    };


    //========================================================
    // Utility functions used by page->model conversions below

    var repairViewportMatrix = function (elements) {
        // Sometimes the rows of matrix are swapped
        var precision = 1e-3;
        var e = elements;
        if (Math.abs(e[0]) < precision) {
            if (Math.abs(e[4]) > precision) {
                // swap row 1 and row 2
                for (var i = 0; i < 4; i++) {
                    var temp = e[i];
                    e[i] = e[i + 4];
                    e[i + 4] = temp;
                }
            }
            else {
                // swap row 1 and row 3
                for (var i = 0; i < 4; i++) {
                    var temp = e[i];
                    e[i] = e[i + 8];
                    e[i + 8] = temp;
                }
            }
        }
        if (Math.abs(e[5]) < precision) {
            // swap row 2 and row 3
            for (var i = 4; i < 8; i++) {
                var temp = e[i];
                e[i] = e[i + 4];
                e[i + 4] = temp;
            }
        }
    };


    var pointInContour = function (x, y, cntr, pts) {
        var yflag0, yflag1;
        var vtx0X, vtx0Y, vtx1X, vtx1Y;

        var inside_flag = false;

        // get the last point in the polygon
        vtx0X = pts[cntr[cntr.length - 1]].x;
        vtx0Y = pts[cntr[cntr.length - 1]].y;

        // get test bit for above/below X axis
        yflag0 = (vtx0Y >= y);

        for (var j = 0, jEnd = cntr.length; j < jEnd; ++j) {
            vtx1X = pts[cntr[j]].x;
            vtx1Y = pts[cntr[j]].y;

            yflag1 = (vtx1Y >= y);

            // Check if endpoints straddle (are on opposite sides) of X axis
            // (i.e. the Y's differ); if so, +X ray could intersect this edge.
            // The old test also checked whether the endpoints are both to the
            // right or to the left of the test point.  However, given the faster
            // intersection point computation used below, this test was found to
            // be a break-even proposition for most polygons and a loser for
            // triangles (where 50% or more of the edges which survive this test
            // will cross quadrants and so have to have the X intersection computed
            // anyway).  I credit Joseph Samosky with inspiring me to try dropping
            // the "both left or both right" part of my code.
            if (yflag0 != yflag1) {
                // Check intersection of pgon segment with +X ray.
                // Note if >= point's X; if so, the ray hits it.
                // The division operation is avoided for the ">=" test by checking
                // the sign of the first vertex wrto the test point; idea inspired
                // by Joseph Samosky's and Mark Haigh-Hutchinson's different
                // polygon inclusion tests.
                if (((vtx1Y - y) * (vtx0X - vtx1X) >=
                    (vtx1X - x) * (vtx0Y - vtx1Y)) == yflag1) {
                    inside_flag = !inside_flag;
                }
            }

            // move to the next pair of vertices, retaining info as possible
            yflag0 = yflag1;
            vtx0X = vtx1X;
            vtx0Y = vtx1Y;
        }

        return inside_flag;
    };

    Model.prototype.pointInPolygon = function (x, y, contours, points) {
        var inside = false;

        for (var i = 0; i < contours.length; i++) {

            if (pointInContour(x, y, contours[i], points))
                inside = !inside;
        }

        return inside;
    };




    Model.prototype.getPageToModelTransform = function (vpId) {

        if (this.myData.pageToModelTransform) {
            return this.myData.pageToModelTransform;
        }

        var f2d = this.myData;
        var metadata = f2d.metadata;
        var pd = metadata.page_dimensions;

        var vp = f2d.viewports[vpId];
        if (!vp) {
            return new THREE.Matrix4();
        }

        if (!f2d.viewportTransforms)
            f2d.viewportTransforms = new Array(f2d.viewports.length);

        //See if we already cached the matrix
        var cached = f2d.viewportTransforms[vpId];
        if (cached)
            return cached;

        //Do the matrix composition in double precision using LmvMatrix,
        //which supports that optionally
        var pageToLogical = new LmvMatrix4(true).set(
          pd.logical_width / pd.page_width, 0, 0, pd.logical_offset_x,
          0, pd.logical_height / pd.page_height, 0, pd.logical_offset_y,
          0, 0, 1, 0,
          0, 0, 0, 1
        );

        var modelToLogicalArray = vp.transform.slice();

        repairViewportMatrix(modelToLogicalArray);

        var modelToLogical = new LmvMatrix4(true);
        modelToLogical.elements.set(modelToLogicalArray);

        var logicalToModel = new LmvMatrix4(true);
        logicalToModel.getInverse(modelToLogical);

        logicalToModel.multiply(pageToLogical);

        //Cache for future use
        f2d.viewportTransforms[vpId] = logicalToModel;

        return logicalToModel;
    };


    /**
     * Paper coordinates to Model coordinates
    */
    Model.prototype.pageToModel = function (point1, point2, vpId) {

        var PRECISION = 1e-2;

        var vpXform = this.getPageToModelTransform(vpId);

        var modelPt1 = new THREE.Vector3().set(point1.x, point1.y, 0).applyMatrix4(vpXform);
        var modelPt2 = new THREE.Vector3().set(point2.x, point2.y, 0).applyMatrix4(vpXform);

        //var paperDist = point1.distanceTo(point2);
        //var modelDist = modelPt1.distanceTo(modelPt2);
        //
        //// TODO: If the scale is 1:1, then it's paper viewport. (Still have double for that)
        //if (Math.abs(modelDist - paperDist) < PRECISION) {
        //    // viewport id is matched with clip id
        //    var indices = this.pointInClip(point1, vpId);
        //
        //    var oldModelPt1 = modelPt1.clone();
        //    var oldModelPt2 = modelPt2.clone();
        //
        //    for (var i = 0; i < indices.length; i++) {
        //
        //        var xform = this.getPageToModelTransform(indices[i]);
        //
        //        modelPt1.set(point1.x, point1.y, 0).applyMatrix4(xform);
        //        modelPt2.set(point2.x, point2.y, 0).applyMatrix4(xform);
        //
        //        modelDist = modelPt1.distanceTo(modelPt2);
        //        // TODO: If the scale is not 1:1, then it's model viewport. (Still have double for that)
        //        if (Math.abs(modelDist - paperDist) > PRECISION) {
        //            break;
        //        }
        //    }
        //
        //    // Don't find model viewport, then use its own viewport.
        //    if (i >= indices.length) {
        //        modelPt1 = oldModelPt1;
        //        modelPt2 = oldModelPt2;
        //    }
        //}

        point1.x = modelPt1.x;
        point1.y = modelPt1.y;
        point2.x = modelPt2.x;
        point2.y = modelPt2.y;

    };


    /**
     * Find the viewports that point lies in its bounds
    */
    Model.prototype.pointInClip = function (point, vpId) {

        var clips = this.myData.clips;
        var clipIds = []; // This will store ids of clip where point lies in

        // clip index starts at 1
        for (var i = 1; i < clips.length; i++) {
            // Don't need to check the point's own viewport's clip, it must be in that clip.
            if (i === vpId)
                continue;

            var contour = [];
            var contours = [];
            var contourCounts = clips[i].contourCounts;
            var points = clips[i].points;
            var index = 0;
            var pts = [];

            // Reorganize contour data
            for (var j = 0; j < contourCounts.length; j++) {
                for (var k = 0; k < contourCounts[j]; k++) {
                    contour.push(index);
                    index++;
                }
                contours.push(contour);
                contour = [];
            }
            for (var j = 0; j < points.length; j += 2) {
                var pt = { x: points[j], y: points[j + 1] };
                pts.push(pt);
            }

            var inside = this.pointInPolygon(point.x, point.y, contours, pts);
            if (inside)
                clipIds.push(i);
        }

        return clipIds;
    };

    Model.prototype.getClip = function (vpId) {

        var clips = this.myData.clips;

        var contour = [];
        var contours = [];
        var contourCounts = clips[vpId].contourCounts;
        var points = clips[vpId].points;
        var index = 0;
        var pts = [];

        // Reorganize contour data
        for (var j = 0; j < contourCounts.length; j++) {
            for (var k = 0; k < contourCounts[j]; k++) {
                contour.push(index);
                index++;
            }
            contours.push(contour);
            contour = [];
        }
        for (var j = 0; j < points.length; j += 2) {
            var pt = { x: points[j], y: points[j + 1] };
            pts.push(pt);
        }

        return { "contours": contours, "points": pts };
    };


    /**
     * Return topology index of the fragment.
     * @param {int} fragId - fragment id
     * @returns {int} topology index
     */
    Model.prototype.getTopoIndex = function (fragId) {
        if (this.myData && this.myData.fragments) {
            var topoIndexes = this.myData.fragments.topoIndexes;
            if (topoIndexes) {
                return topoIndexes[fragId];
            }
        }
    };

    /**
     * Return topology data of one fragment.
     * @param {int} index - topology index
     * @returns {object} topology data
     */
    Model.prototype.getTopology = function (index) {
        if (this.myData) {
            var topology = this.myData.topology;
            if (topology) {
                var item = topology[index];
                if (item) {
                    return item;
                }
            }
        }
    };

    Model.prototype.hasTopology = function () {
        if (this.myData) {
            var topology = this.myData.topology;
            if (topology) {
                return true;
            }
        }
    };

    Model.prototype.getAttributeToIdMap = function (onSuccessCallback, onErrorCallback) {
        var self = this;
        if (this.isLoadDone()) {
            this.myData.propWorker.attributeToIdMap(onSuccessCallback, onErrorCallback);
        } else {
            this.getObjectTree(function () {
                self.myData.propWorker.attributeToIdMap(onSuccessCallback, onErrorCallback);
            });
        }
    };

    return Model;
});