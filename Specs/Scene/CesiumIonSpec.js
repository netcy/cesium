fdefineSuite([
        'Scene/CesiumIon',
        'Core/Resource',
        'ThirdParty/when'
    ], function(
        CesiumIon,
        Resource,
        when) {
    'use strict';

    var assetId = 123890213;

    var endpoint = {
        type: '3DTILES',
        url: 'https://assets.cesium.com/' + assetId,
        accessToken: 'not_really_a_refresh_token'
    };

    it('createResource calls CesiumIonResource.create with expected default parameters', function() {
        var mockResource = {};
        var loadJson = spyOn(CesiumIon, '_loadJson').and.returnValue(when.resolve(endpoint));
        var create = spyOn(CesiumIon._CesiumIonResource, 'create').and.returnValue(mockResource);

        return CesiumIon.createResource(assetId).then(function(resource) {
            var loadArgs = loadJson.calls.argsFor(0);
            var endpointResource = loadArgs[0];
            expect(endpointResource).toBeInstanceOf(Resource);
            expect(endpointResource.getUrlComponent()).toEqual(CesiumIon.defaultServerUrl + '/v1/assets/' + assetId + '/endpoint');
            expect(create).toHaveBeenCalledWith(endpoint, endpointResource);
            expect(resource).toBe(mockResource);
        });
    });

    it('createResource calls CesiumIonResource.create with expected parameters', function() {
        var mockResource = {};
        var options = { accessToken: 'not_a_token', serverUrl: 'https://test.invalid' };
        var loadJson = spyOn(CesiumIon, '_loadJson').and.returnValue(when.resolve(endpoint));
        var create = spyOn(CesiumIon._CesiumIonResource, 'create').and.returnValue(mockResource);

        return CesiumIon.createResource(assetId, options).then(function(resource) {
            var loadArgs = loadJson.calls.argsFor(0);
            var endpointResource = loadArgs[0];
            expect(endpointResource).toBeInstanceOf(Resource);
            expect(endpointResource.getUrlComponent()).toEqual(options.serverUrl + '/v1/assets/' + assetId + '/endpoint');
            expect(endpointResource.queryParameters).toEqual({ access_token: options.accessToken });
            expect(create).toHaveBeenCalledWith(endpoint, endpointResource);
            expect(resource).toBe(mockResource);
        });
    });

    it('createImageryProvider calls createResource and returns createImageryProvider result', function() {
        var mockImageryProvider = {};
        var mockResource = { createImageryProvider: jasmine.createSpy('createImageryProvider').and.returnValue(mockImageryProvider) };

        spyOn(CesiumIon, 'createResource').and.returnValue(when.resolve(mockResource));

        var options = {};
        return CesiumIon.createImageryProvider(assetId, options)
            .then(function(imageryProvider) {
                expect(CesiumIon.createResource).toHaveBeenCalledWith(assetId, options);
                expect(mockResource.createImageryProvider).toHaveBeenCalledWith();
                expect(imageryProvider).toBe(mockImageryProvider);
            });
    });

    fdescribe('CesiumIonResource', function() {
        it('constructs with expected values', function() {
            spyOn(Resource, 'call').and.callThrough();

            var resourceOptions = { url: 'https://test.invalid' };
            var endpointResource = new Resource({ url: 'https://api.test.invalid' });
            var resource = new CesiumIon._CesiumIonResource(resourceOptions, endpoint, endpointResource);
            expect(resource).toBeInstanceOf(Resource);
            expect(resource.ionData.endpoint).toEqual(endpoint);
            expect(Resource.call).toHaveBeenCalledWith(resource, resourceOptions);
        });

        it('clone works', function() {
            var resourceOptions = { url: 'https://test.invalid' };
            var endpointResource = new Resource({ url: 'https://api.test.invalid' });
            var resource = new CesiumIon._CesiumIonResource(resourceOptions, endpoint, endpointResource);
            var cloned = resource.clone();
            expect(cloned).toEqual(resource);
            expect(cloned).not.toBe(resource);
        });
    });
});
