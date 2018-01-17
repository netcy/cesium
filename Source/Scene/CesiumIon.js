define([
        '../Core/Check',
        '../Core/defaultValue',
        '../Core/defined',
        '../Core/loadJson',
        '../Core/Resource',
        '../Core/RuntimeError',
        '../Scene/ArcGisMapServerImageryProvider',
        '../Scene/BingMapsImageryProvider',
        '../Scene/createTileMapServiceImageryProvider',
        '../Scene/GoogleEarthEnterpriseMapsProvider',
        '../Scene/MapboxImageryProvider',
        '../Scene/SingleTileImageryProvider',
        '../Scene/UrlTemplateImageryProvider',
        '../Scene/WebMapServiceImageryProvider',
        '../Scene/WebMapTileServiceImageryProvider'
    ], function(
        Check,
        defaultValue,
        defined,
        loadJson,
        Resource,
        RuntimeError,
        ArcGisMapServerImageryProvider,
        BingMapsImageryProvider,
        createTileMapServiceImageryProvider,
        GoogleEarthEnterpriseMapsProvider,
        MapboxImageryProvider,
        SingleTileImageryProvider,
        UrlTemplateImageryProvider,
        WebMapServiceImageryProvider,
        WebMapTileServiceImageryProvider) {
    'use strict';

    /**
     * Utility class for working with the Cesium Ion API.
     *
     * @see https://cesium.com
     *
     * @exports CesiumIon
     */
    var CesiumIon = {};

    /**
     * The default Cesium Ion access token to use.
     * If this property is undefined, no access_token query parameter will be set on requests.
     *
     * @type {String}
     */
    CesiumIon.defaultAccessToken = undefined;

    /**
     * The default Cesium Ion server to use.
     *
     * @type {String}
     * @default https://api.cesium.com
     */
    CesiumIon.defaultServerUrl = 'https://api.cesium.com';

    /**
     * Creates a {@link Resource} representing a Cesium Ion asset.
     *
     * @param {Number} assetId The Cesium Ion asset id.
     * @param {Object} [options] An object with the following properties:
     * @param {String} [options.accessToken=CesiumIon.defaultAccessToken] The access token to use.
     * @param {String} [options.serverUrl=CesiumIon.defaultServerUrl] The url to the Cesium Ion API server.
     * @returns {Promise.<Resource>} A Promise to a Resource representing the Cesium Ion Asset.
     *
     * @example
     * //Load a Cesium3DTileset with asset ID of 124624234
     * var tileset = new Cesium.Cesium3DTileset({ url: Cesium.CesiumIon.createResource(124624234) });
     *
     * @example
     * //Load a CZML file with asset ID of 10890
     * viewer.dataSources.add(Cesium.CzmlDataSource.load(Cesium.CesiumIon.createResource(10890)));
     *
     * @example
     * //Load an ImageryProvider with asset ID of 2347923
     * var imageryProvider = Cesium.createTileMapServiceImageryProvider({url : new Cesium.CesiumIon.createImageryProvider(2347923) });
     */
    CesiumIon.createResource = function (assetId, options) {
        Check.defined('assetId', assetId);

        options = defaultValue(options, defaultValue.EMPTY_OBJECT);
        var serverUrl = defaultValue(options.serverUrl, CesiumIon.defaultServerUrl);
        var accessToken = defaultValue(options.accessToken, CesiumIon.defaultAccessToken);

        var resourceOptions = {
            url: serverUrl + '/v1/assets/' + assetId + '/endpoint'
        };

        if (defined(accessToken)) {
            resourceOptions.queryParameters = { access_token: accessToken };
        }

        var endpointResource = new Resource(resourceOptions);
        return CesiumIon._loadJson(endpointResource)
            .then(function (endpoint) {
                return CesiumIonResource.create(endpoint, endpointResource);
            });
    };

    /**
     * Creates an {@link ImageryProvider} representing a Cesium Ion imagery asset.
     * Unlike {@link CesiumIon.createResource}, this function supports beta external asset
     * functionality.
     *
     * @param {Number} assetId The Cesium Ion asset id.
     * @param {Object} [options] An object with the following properties:
     * @param {String} [options.accessToken=CesiumIon.defaultAccessToken] The access token to use.
     * @param {String} [options.serverUrl=CesiumIon.defaultServerUrl] The url to the Cesium Ion API server.
     * @returns {Promise<ImageryProvider>} A promise to an imagery provider presenting the requested Cesium Ion Asset.
     *
     * @experimental CesiumIon.createImageryProvider is part of Cesium Ion beta functionality and may change without our normal deprecation policy.
     */
    CesiumIon.createImageryProvider = function (assetId, options) {
        return CesiumIon.createResource(assetId, options)
            .then(function (resource) {
                return resource.createImageryProvider();
            });
    };

    /**
     * @private
     */
    function CesiumIonResource(options, endpoint, endpointResource) {
        Resource.call(this, options);

        this.ionData = {
            endpoint: endpoint,
            _endpointResource: endpointResource,
            _pendingPromise: undefined,
            _root: this
        };
    }

    CesiumIonResource.create = function (endpoint, endpointResource) {
        var options = {
            url: endpoint.url,
            retryCallback: createRetryCallback(endpoint, endpointResource),
            retryAttempts: 1
        };

        if (defined(endpoint.accessToken)) {
            options.queryParameters = { access_token: endpoint.accessToken };
        }

        return new CesiumIonResource(options, endpoint, endpointResource);
    };

    if (defined(Object.create)) {
        CesiumIonResource.prototype = Object.create(Resource.prototype);
        CesiumIonResource.prototype.constructor = CesiumIonResource;
    }

    CesiumIonResource.prototype.clone = function (result) {
        if (!defined(result)) {
            result = new CesiumIonResource({
                url: this._url
            });
        }
        result = Resource.prototype.clone.call(this, result);
        result.ionData = this.ionData;
        return result;
    };

    function createRetryCallback(endpoint, endpointResource) {
        return function (that, error) {
            // We only want to retry in the case of invalid credentials (401) or image
            // requests(since Image failures can not provide a status code)
            if (!defined(error) || (error.statusCode !== 401 && !(error.target instanceof Image))) {
                return false;
            }

            var ionData = that.ionData;

            // We use a shared pending promise for all derived assets, since they share
            // a common access_token.  If we're already requesting a new token for this
            // asset, we wait on the same promise.
            var pendingPromise = ionData._pendingPromise;
            if (!defined(pendingPromise)) {
                var accessToken;
                pendingPromise = CesiumIon._loadJson(endpointResource)
                    .then(function (endpoint) {
                        //Set the token for root resource that this (and other) resources were derived
                        ionData._root.queryParameters.access_token = endpoint.accessToken;
                        return accessToken;
                    })
                    .always(function () {
                        // Pass or fail, we're done with this promise, the next failure should use a new one.
                        ionData._pendingPromise = undefined;

                        // We need this return because our old busted version of when
                        // doesn't conform to spec of returning the result of the above `then`.
                        return accessToken;
                    });
                ionData._pendingPromise = pendingPromise;
            }

            return pendingPromise.then(function (accessToken) {
                // Set the new token for this resource
                that.queryParameters.access_token = endpoint.accessToken;
                return true;
            });
        };
    }

    function createFactory(Type) {
        return function (options) {
            return new Type(options);
        };
    }

    // These values are the unofficial list of supported external imagery
    // assets in the Cesium Ion beta. They are subject to change.
    var ImageryProviderMapping = {
        IMAGERY: createTileMapServiceImageryProvider,
        ARCGIS_MAPSERVER: createFactory(ArcGisMapServerImageryProvider),
        BING: createFactory(BingMapsImageryProvider),
        GOOGLE_EARTH: createFactory(GoogleEarthEnterpriseMapsProvider),
        MAPBOX: createFactory(MapboxImageryProvider),
        SINGLE_TILE: createFactory(SingleTileImageryProvider),
        TMS: createTileMapServiceImageryProvider,
        URL_TEMPLATE: createFactory(UrlTemplateImageryProvider),
        WMS: createFactory(WebMapServiceImageryProvider),
        WMTS: createFactory(WebMapTileServiceImageryProvider)
    };

    CesiumIonResource.prototype.createImageryProvider = function () {
        var type = this.ionData.endpoint.type;
        var factory = ImageryProviderMapping[type];

        if (!defined(factory)) {
            throw new RuntimeError('Unrecognized Cesium Ion imagery type: ' + type);
        }

        return factory({ url: this });
    };

    //Exposed for testing
    CesiumIon._CesiumIonResource = CesiumIonResource;
    CesiumIon._loadJson = loadJson;

    return CesiumIon;
});
