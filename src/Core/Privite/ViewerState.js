define([
    '../Logger',
    './LightPresets'
], function(Logger, LightPresets) {
    'use strict';
    /**
     * Responsible for creating and restoring viewer states.
     *
     * Main interactions come from methods
     * - getState()
     * - restoreState()
     *
     * Consumer classes can check if a given
     *
     * @tutorial viewer_state
     * @param {Autodesk.Viewing.Viewer3D} viewer - Viewer instance used to operate on.
     * @constructor
     */
    var ViewerState = function (viewer) {

        /**
         * All-inclusive filter constant used when no filter is provided.
         * @type {boolean}
         * @private
         */
        var FILTER_ALL = true;


        /**
         * Returns a unique identifier.
         *
         * @returns {string}
         * @deprecated
         * @private
         */
        function makeRandom() {
            // TODO: think a better way to get random numbers (Math.random is not a good random function).
            var random = Math.round(Math.random() * 0xffffffff);
            var timestamp = Date.now();

            return random.toString(16) + timestamp.toString(16);
        }


        /**
         * Returns a viewer state Object for the current viewer instance.
         *
         * For details and sample usage, please check {@tutorial viewer_state}
         *
         * @param {Object} [filter] - Object with a structure similar to the output where
         *                          values are replaced with Booleans true/false indicating
         *                          whether they should be stored or not.
         * @returns {Object} - Plain object describing the state of the viewer.
         * @tutorial viewer_state
         */
        this.getState = function (filter) {

            var nav = viewer.navigation;
            var viewerState = {};

            // Adding level-0 properties
            viewerState["guid"] = makeRandom();
            viewerState["seedURN"] = this.getSeedUrn();
            viewerState["overrides"] = this.getTransformsOverrides();


            // Object set, contains selection, isolation and explode value.
            var objectSet = viewerState["objectSet"];
            if (!Array.isArray(objectSet)) {
                viewerState["objectSet"] = objectSet = [];
            }
            // Spec call for these elements to grouped in an Object at an Array's index 0.
            // 3d models attributes
            if (viewer.model && !viewer.model.is2d()) {
                objectSet[0] = {
                    id: this.getSelectedNodes(),
                    isolated: viewer.getIsolatedNodes(),
                    hidden: viewer.getHiddenNodes(),
                    explodeScale: viewer.getExplodeScale(),
                    idType: 'lmv'
                };
            }
            // 2d models attributes
            if (viewer.model && viewer.model.is2d()) {
                objectSet[0] = {
                    id: this.getSelectedNodes(), // Works for 2d and 3d
                    isolated: this.getVisibleLayers2d(),
                    hidden: [], // There's no hide feature for 2d.
                    idType: 'lmv'
                };
            }

            // Viewport
            var viewport = viewerState["viewport"];
            if (!viewport) {
                viewport = viewerState["viewport"] = {};
            }

            var bPerspectiveCam = nav.getCamera().isPerspective;
            viewport["name"] = ""; // TODO: Populate accordingly; Requested by the mobile team.
            viewport["eye"] = nav.getPosition().toArray();
            viewport["target"] = nav.getTarget().toArray();
            viewport["up"] = nav.getCamera().up.toArray();
            viewport["worldUpVector"] = nav.getWorldUpVector().toArray();
            viewport["pivotPoint"] = nav.getPivotPoint().toArray();
            viewport["distanceToOrbit"] = nav.getPivotPlaneDistance();
            viewport["aspectRatio"] = this.getAspectRatio();
            viewport["projection"] = bPerspectiveCam ? "perspective" : "orthographic";
            viewport["isOrthographic"] = !bPerspectiveCam;
            if (bPerspectiveCam) {
                viewport["fieldOfView"] = nav.getVerticalFov();
            } else {
                viewport["orthographicHeight"] = this.getOrthographicHeight();
            }


            // Render Options
            var renderOptions = viewerState["renderOptions"];
            if (!renderOptions) {
                renderOptions = viewerState["renderOptions"] = {};
            }
            renderOptions["environment"] = LightPresets[viewer.impl.currentLightPreset()].name;
            renderOptions["ambientOcclusion"] = {
                enabled: viewer.impl.renderer().settings.sao,
                radius: viewer.impl.renderer().getAORadius(),
                intensity: viewer.impl.renderer().getAOIntensity()
            };
            renderOptions["toneMap"] = {
                method: viewer.impl.renderer().getToneMapMethod(),
                exposure: viewer.impl.renderer().getExposureBias(),
                lightMultiplier: this.getToneMapIntensity()
            };
            renderOptions["appearance"] = {
                ghostHidden: viewer.impl.showGhosting,
                ambientShadow: viewer.prefs.ambientShadows,
                antiAliasing: viewer.impl.renderer().settings.antialias,
                progressiveDisplay: viewer.prefs.progressiveRendering,
                swapBlackAndWhite: viewer.prefs.swapBlackAndWhite,
                displayLines: viewer.prefs.lineRendering
            };

            // Cutplanes (aka: Sectioning) are a 3d-only feature.
            if (viewer.model && !viewer.model.is2d()) {
                var cutplanes = viewerState["cutplanes"] = [];
                var planes = viewer.getCutPlanes();
                for (var i = 0; i < planes.length; i++) {
                    cutplanes.push(planes[i].toArray());
                }
            }

            // Allow extensions to inject their state data
            for (var extensionName in viewer.loadedExtensions) {
                var extension = viewer.loadedExtensions[extensionName];
                extension.getState && extension.getState(viewerState);
            }

            // Filter out values the user doesn't want to consume before returning.
            if (filter && filter !== FILTER_ALL) {
                this.applyFilter(viewerState, filter);
            }
            return viewerState;
        };


        /**
         * Restores the associated viewer instance with the provided viewerState object.
         *
         * For details and sample usage, please check {@tutorial viewer_state}
         *
         * @param {Object} viewerState
         * @param {Object} [filter] - Similar in structure to viewerState used to filter out values
         *                            that should not be restored.
         * @param {boolean} [immediate] - Whether the state should be apply with (false)
         *                                or without (true) a smooth transition
         *
         * @returns {boolean} true, if the operation was successful.
         * @tutorial viewer_state
         */
        this.restoreState = function (viewerState, filter, immediate) {

            if (!viewerState) {
                Logger.warn("restoreState has no viewer state to restore from.");
                return false;
            }

            if (!viewer || !viewer.model) {
                Logger.warn("restoreState has no viewer or model to restore.");
                return false;
            }

            if (filter && filter !== FILTER_ALL) {
                // To avoid modifying viewerState passed in, we create a clone of it
                viewerState = JSON.parse(JSON.stringify(viewerState));
                this.applyFilter(viewerState, filter);
            }

            var nav = viewer.navigation;
            var isModel2d = viewer.model.is2d();
            var isModel3d = !isModel2d;

            // Objectset
            if (viewer.model && Array.isArray(viewerState.objectSet) && viewerState.objectSet.length > 0) {
                var objectSet = viewerState.objectSet[0];

                // Selection (2d and 3d)
                var selectionIds = objectSet.id;
                if (selectionIds) {
                    selectionIds = this.toIntArray(selectionIds);
                    viewer.select(selectionIds);
                }

                // Isolation / Hidden depends on whether it is 2d or 3d
                if (isModel2d) {

                    // 2d Isolation is Layer visibility
                    var visibleLayers = objectSet.isolated;
                    if (Array.isArray(visibleLayers) && visibleLayers.length > 0) {
                        // Only certain layers are visible
                        viewer.setLayerVisible(null, false); // start by hiding all
                        viewer.impl.setLayerVisible(visibleLayers, true);
                    } else {
                        // All layers are visible
                        viewer.setLayerVisible(null, true);
                    }
                } else {
                    // 3d Isolation
                    var isolatedIds = objectSet.isolated || [];
                    isolatedIds = this.toIntArray(isolatedIds);
                    viewer.isolate(isolatedIds);

                    // 3d Hidden nodes (only when there's no isolation) (3d only)
                    if (isolatedIds.length === 0) {
                        var hiddenIds = objectSet.hidden || null;
                        if (hiddenIds && hiddenIds.length > 0) {
                            hiddenIds = this.toIntArray(hiddenIds);
                            viewer.hide(hiddenIds);
                        }
                    }
                }

                // Explode scale (3d)
                if ("explodeScale" in objectSet) {
                    var explodeScale = parseFloat(objectSet.explodeScale);
                    if (viewer.explode) {
                        viewer.explode(explodeScale);
                    }
                }
            }

            var viewport = viewerState.viewport;
            if (viewport) {

                var eye = this.getVector3FromArray(viewport.eye, nav.getPosition());
                var up = this.getVector3FromArray(viewport.up, nav.getCamera().up);
                var target = this.getVector3FromArray(viewport.target, nav.getTarget());
                var fov = ("fieldOfView" in viewport) ? parseFloat(viewport.fieldOfView) : nav.getVerticalFov();
                var worldUp = this.getVector3FromArray(viewport.worldUpVector, null);
                if (!worldUp) {
                    var upVectorArray = viewer.model ? viewer.model.getUpVector() : null;
                    if (upVectorArray) {
                        worldUp = new THREE.Vector3().fromArray(upVectorArray);
                    } else {
                        worldUp = new THREE.Vector3(0, 1, 0); // TODO: Can we do better? Is it worth it?
                    }
                }

                // Retain current values if not available in restore object
                var isPerspective = nav.getCamera().isPerspective;
                if ('isOrthographic' in viewport) {
                    isPerspective = !viewport.isOrthographic;
                }
                var orthoScale = this.getOrthographicHeight();
                if ('orthographicHeight' in viewport) {
                    orthoScale = Number(viewport.orthographicHeight);
                }

                // Pivot is currently not taken into account. Target is set as the new pivot.
                var camera = {
                    position: eye,
                    target: target,
                    up: up,
                    worldup: worldUp,
                    aspect: viewer.impl.camera.aspect,
                    fov: fov,
                    orthoScale: orthoScale,
                    isPerspective: isPerspective
                };

                this.restoreCameraState(camera, immediate);
            }


            // Render option state
            var renderOptions = viewerState.renderOptions;
            if (renderOptions) {

                // current values
                var saoEnabled = viewer.prefs.ambientShadows;
                var antiAliasing = viewer.prefs.antialiasing;

                var sao = renderOptions.ambientOcclusion;
                if (sao) {
                    if ("enabled" in sao) {
                        saoEnabled = sao.enabled;
                    }
                    var saoRadius = ("radius" in sao) ? sao.radius : null;
                    var saoIntensity = ("intensity" in sao) ? sao.intensity : null;
                    if (saoRadius !== null && saoIntensity !== null) {
                        viewer.impl.renderer().setAOOptions(saoRadius, saoIntensity);
                        viewer.impl.renderer().composeFinalFrame(false);
                    }
                }

                if ("environment" in renderOptions) {
                    var lightPresetIndex = this.getLightPresetIndex(renderOptions.environment);
                    if (lightPresetIndex !== -1 && isModel3d) {
                        viewer.setLightPreset(lightPresetIndex);
                    }
                }

                // ToneMap values are overrides to the environment settings.
                var toneMap = renderOptions.toneMap;
                if (toneMap) {
                    var lightMultiplier = "lightMultiplier" in toneMap ? toneMap.lightMultiplier : null;
                    var exposure = "exposure" in toneMap ? toneMap.exposure : null;
                    if (lightMultiplier !== null && exposure !== null) {
                        if (viewer.impl.dir_light1) {
                            viewer.impl.dir_light1.intensity = Math.pow(2.0, lightMultiplier);
                        }
                        viewer.impl.renderer().setTonemapExposureBias(exposure, lightMultiplier);
                        viewer.impl.invalidate(true);
                    }
                }

                var appearance = renderOptions.appearance;
                if (appearance) {
                    if ("antiAliasing" in appearance) {
                        antiAliasing = appearance.antiAliasing;
                    }
                    if ("progressiveDisplay" in appearance) {
                        viewer.setProgressiveRendering(appearance.progressiveDisplay);
                    }
                    if ("swapBlackAndWhite" in appearance) {
                        viewer.setSwapBlackAndWhite(appearance.swapBlackAndWhite);
                    }
                    if (("ghostHidden" in appearance) && isModel3d) {
                        viewer.setGhosting(appearance.ghostHidden);
                    }
                    if ("displayLines" in appearance) {
                        viewer.hideLines(!appearance.displayLines);
                    }
                }

                // SAO and AA at the end.
                if (isModel3d) {
                    viewer.setQualityLevel(saoEnabled, antiAliasing);
                }
            }

            // Restore cutplanes (aka: Sectioning) data only for 3d models.
            if (Array.isArray(viewerState.cutplanes) && viewer.model && isModel3d) {
                var cutplanes = [];
                for (var i = 0; i < viewerState.cutplanes.length; i++) {
                    var plane = viewerState.cutplanes[i];
                    if (Array.isArray(plane) && plane.length >= 4) {
                        cutplanes.push(new THREE.Vector4(plane[0], plane[1], plane[2], plane[3]));
                    }
                }
                viewer.setCutPlanes(cutplanes);
            }

            // Allow extensions to restore their data
            for (var extensionName in viewer.loadedExtensions) {
                var extension = viewer.loadedExtensions[extensionName];
                extension.restoreState && extension.restoreState(viewerState, immediate);
            }

            return true;
        };

        /**
         * Restores camera states values back into the viewer.
         * We avoid using methods such as setViewFromCamera() because those make some
         * assumptions about the current state of the viewer. We need no such things.
         *
         * Note: Implementation based on Viewer3DImpl.setViewFromCamera()
         *
         * @param {Object} camera
         * @param {Boolean} immediate
         * @private
         */
        this.restoreCameraState = function (camera, immediate) {

            viewer.impl.adjustOrthoCamera(camera);
            var navapi = viewer.navigation;

            if (!immediate) {
                // With animation
                viewer.impl.camera.isPerspective = camera.isPerspective;
                navapi.setRequestTransitionWithUp(true, camera.position, camera.target, camera.fov, camera.up, camera.worldup);
            } else {
                // Instantaneous, no animation
                if (camera.isPerspective) {
                    navapi.toPerspective();
                } else {
                    navapi.toOrthographic();
                }
                navapi.setCameraUpVector(camera.up);
                navapi.setWorldUpVector(camera.worldup);
                navapi.setView(camera.position, camera.target);
                navapi.setPivotPoint(camera.target);
                navapi.setVerticalFov(camera.fov, false);

                viewer.impl.syncCamera(true);
            }
        };

        /**
         * Helper method with the intent to change the type of an array with ids from String to ints.
         * We need this method because we need to make sure that ids that get fed into the ViewerState
         * are in the correct type.
         *
         * @param {Array} array - example: ["45", "33", "1"]
         * @returns {Array} - example: [45, 33, 1]
         * @private
         */
        this.toIntArray = function (array) {
            var ret = [];
            if (Array.isArray(array)) {
                for (var i = 0, len = array.length; i < len; ++i) {
                    ret.push(parseInt(array[i]));
                }
            }
            return ret;
        };

        /**
         * Helper function that given a viewer state, extracts the selected nodes.
         *
         * @param {Object} viewerState - for example, the result of this.getState().
         * @return {Array} Array containing Number-typed ids of the selected nodes. Empty array when no 'selected'
         *                 objectSet value is defined.
         * @private
         * @deprecated
         */
        this.extractSelectedNodeIds = function (viewerState) {

            if (viewerState && Array.isArray(viewerState.objectSet) && viewerState.objectSet.length > 0) {
                var objectSet = viewerState.objectSet[0];
                return this.toIntArray(objectSet.id);
            }
            return [];
        };

        /**
         * Helper function that given a viewer state, extracts the isolated nodes.
         *
         * @param {Object} viewerState - for example, the result of this.getState().
         * @return {Array} Array containing Number-typed ids of the isolated nodes. Empty array when no 'isolated'
         *                 objectSet value is defined.
         * @private
         * @deprecated
         */
        this.extractIsolatedNodeIds = function (viewerState) {

            if (viewerState && Array.isArray(viewerState.objectSet) && viewerState.objectSet.length > 0) {
                var objectSet = viewerState.objectSet[0];
                return this.toIntArray(objectSet.isolated);
            }
            return [];
        };

        /**
         * Helper method that constructs a Vector3 from a given Array.
         * If Array is not well-formed, then the failValue is return instead.
         *
         * @param {Array} array - An array with 3 values
         * @param {THREE.Vector3} failValue - If array param is invalid, failValue will be returned instead.
         *
         * @returns {THREE.Vector3} either a new Vector with values coming from 'array' or failValue.
         * @private
         */
        this.getVector3FromArray = function (array, failValue) {

            if (array instanceof Array && array.length > 2) {

                // Some array values are exported as string-of-numbers. Fix that here.
                array[0] = parseFloat(array[0]);
                array[1] = parseFloat(array[1]);
                array[2] = parseFloat(array[2]);
                return new THREE.Vector3().fromArray(array);
            }
            return failValue;
        };

        /**
         * Helper function that returns selected node ids in an array.
         * @returns {Array}
         * @private
         */
        this.getSelectedNodes = function () {

            return viewer.impl && viewer.impl.selector ? viewer.impl.selector.getSelection() : [];

        };

        /**
         * Helper function that returns the index values of the isolated (visible) layers
         * Applies only to 2d models/blueprints
         * @private
         */
        this.getVisibleLayers2d = function () {
            var ret = [];
            var materialManager = viewer.impl.matman();
            var layersMap = materialManager.layersMap;
            for (var layerIndex in layersMap) {
                if (layersMap.hasOwnProperty(layerIndex)) {
                    if (materialManager.isLayerVisible(layerIndex)) {
                        ret.push(layerIndex);
                    }
                }
            }
            return ret;
        };

        /**
         * Gets the aspect ratio.
         *
         * @returns {number} aspect ratio
         * @private
         */
        this.getAspectRatio = function () {
            var viewport = viewer.navigation.getScreenViewport();
            var aspect = viewport.width / viewport.height;
            return aspect;
        };

        /**
         * Returns world height when in orthographic camera mode.
         * @returns {number}
         * @private
         */
        this.getOrthographicHeight = function () {
            var cam = viewer.navigation.getCamera();
            if (cam.isPerspective) return 0;
            return Math.abs(2 * cam.orthographicCamera.top);
        };

        /**
         * Returns the URN of the document model.
         * @returns {String}
         */
        this.getSeedUrn = function () {
            if (viewer.model && viewer.model.loader) {
                return viewer.model.loader.svfUrn || "";
            }
            return "";
        };

        /**
         * TODO: Add proper comment
         * @returns {{}}
         * @private
         */
        this.getTransformsOverrides = function () {

            // TODO: Add proper implementation.
            return { transformations: [] };
        };

        /**
         * Returns the slider value for the viewer's current light intensity
         * @returns {number}
         * @private
         */
        this.getToneMapIntensity = function () {

            // Original code from RenderOptionsPanel.js
            // Should probably live elsewhere in the api.
            var intensity = 0.0;
            if (viewer.impl.dir_light1) {
                if (viewer.impl.dir_light1.intensity != 0)
                    intensity = Math.log(viewer.impl.dir_light1.intensity) / Math.log(2.0);
                else
                    intensity = -1e-20;
            }
            return intensity;
        };

        /**
         * Returns the index of the LightPreset with a matching name value.
         * @param environmentName
         * @returns {number} index of LightPreset, or -1 if not found.
         * @private
         */
        this.getLightPresetIndex = function (environmentName) {

            for (var i = 0; i < LightPresets.length; i++) {
                if (LightPresets[i].name === environmentName) {
                    return i;
                }
            }
            return -1;
        };

        /**
         * Filters out key/value pairs from the viewerState.
         *
         * @note To get all of the values available use FILTER_ALL. If no filter is provided FILTER_ALL will be used.
         *       It is encourage for consumers to define their specialized filters.
         *
         * @param {Object} viewerState - Object to be filtered.
         * @param {Object} filter - Object with a similar structure to viewerState, where values are Booleans signaling which
         *                          elements should be included (true) and which ones should not (false).
         *                          If a viewerState key is not found in the filter, we assume that it is non-wanted.
         *
         * @private
         */
        this.applyFilter = function (viewerState, filter) {

            // Check the 'ALL' filter
            if (filter === true) return;

            // Filtering only 1 level depth keys
            // Additional levels are checked recursively.
            for (var key in viewerState) {

                if (!viewerState.hasOwnProperty(key)) {
                    continue;
                }

                // Try to find the key in the filter object
                var filterValue = filter[key];

                if (filterValue === undefined) {

                    // key not enabled in filter, remove key/value pair from viewerState.
                    delete viewerState[key];
                    Logger.log("[applyFilter] C - skipping key [" + key + "] from viewerState; unspecified in filter.");
                }
                else if (typeof (filterValue) === 'boolean') {

                    if (filterValue === false) {
                        // key explicitly flagged for removal, remove key/value pair from viewerState.
                        delete viewerState[key];
                        Logger.log("[applyFilter] D - skipping key [" + key + "] from viewerState; explicit filtering.");
                    }
                }
                else if (filterValue instanceof Object) {

                    if (viewerState[key] instanceof Object) {
                        // Both are Objects, recursive call on them.
                        this.applyFilter(viewerState[key], filter[key]);
                    } else {
                        // This case signals a miss-match between filter and value.
                        // Since it's an undefined case, we'll be inclusive for the time being.
                        // *** Keep the value in viewerState ***
                        Logger.warn("[applyFilter] A - Invalid filter Object for key [" + key + "]");
                    }
                }
                else {

                    // Note: Every other value for filter is invalid.
                    // For now, we'll keep the key/value in viewerState.
                    Logger.warn("[applyFilter] B - Invalid filter value for key [" + key + "]");
                }

            }
        };

    };

    ViewerState.prototype.constructor = ViewerState;

    return ViewerState;
;
});