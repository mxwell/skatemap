function defaultState() {
    return {
        lat: POIs.moscow[0],
        lng: POIs.moscow[1],
        zoom: CONFIG_DEFAULT_ZOOM,
    };
}

function stateFromUrl() {
    const url = window.location.pathname;
    const atPos = url.indexOf("@");
    if (atPos < 0) {
        return defaultState();
    }
    const zPos = url.indexOf("z", atPos);
    if (zPos < 0) {
        return defaultState();
    }
    const tokens = url.substr(atPos + 1, zPos - atPos - 1).split(",");
    if (tokens.length != 3) {
        return defaultState();
    }
    return {
        lat: Number.parseFloat(tokens[0]),
        lng: Number.parseFloat(tokens[1]),
        zoom: Number.parseInt(tokens[2]),
    };
}

function stateToUrl(state) {
    const path = "@" + state.lat.toPrecision(9) + "," + state.lng.toPrecision(9) + "," + state.zoom + "z";
    return encodeURI(path);
}

function createMap(state) {
    return L.map("mapid", {
        center: [state.lat, state.lng],
        zoom: state.zoom,
        minZoom: CONFIG_MIN_ZOOM,
        maxZoom: CONFIG_MAX_ZOOM,
    });
}

var globalMapObj = undefined;
var prevBounds = undefined;
var locationMarker = undefined;

function getMyMap() {
    if (typeof globalMapObj === "undefined") {
        globalMapObj = createMap(stateFromUrl());
    }
    return globalMapObj;
}

function getStateFromMap() {
    var mymap = getMyMap();
    var c = mymap.getCenter();
    return {
        lat: c.lat,
        lng: c.lng,
        zoom: mymap.getZoom(),
    };
}

function receiveWaysData(data) {
    if (data.status !== "success") {
        console.log("Failed to get ways data. Status: " + data.status);
        prevBounds = undefined;
        return;
    }
    var ways_data = data.result.ways;
    addWays(ways_data, getMyMap());
}

function makeBbox(w, s, e, n) {
    return {
        west: w,
        south: s,
        east: e,
        north: n
    };
}

function getNewBboxes() {
    const mymap = getMyMap();
    const bounds = mymap.getBounds();
    const west = bounds.getWest();
    const south = bounds.getSouth();
    const east = bounds.getEast();
    const north = bounds.getNorth();
    const whole = makeBbox(west, south, east, north);

    if (typeof prevBounds === "undefined") {
        return [whole];
    }

    var result = [];
    const westPrev = prevBounds.west;
    const southPrev = prevBounds.south;
    const eastPrev = prevBounds.east;
    const northPrev = prevBounds.north;
    if (west < westPrev) {
        if (east < westPrev) {
            return [whole];
        }
        result.push(makeBbox(west, south, westPrev, north));
    }
    if (east > eastPrev) {
        if (west > eastPrev) {
            return [whole];
        }
        result.push(makeBbox(eastPrev, south, east, north));
    }
    if (south < southPrev) {
        if (north < southPrev) {
            return [whole];
        }
        result.push(makeBbox(west, south, east, southPrev));
    }
    if (north > northPrev) {
        if (south > northPrev) {
            return [whole];
        }
        result.push(makeBbox(west, northPrev, east, north));
    }
    return result;
}

function saveBounds() {
    const mymap = getMyMap();
    const bounds = mymap.getBounds();
    const w = bounds.getWest();
    const s = bounds.getSouth();
    const e = bounds.getEast();
    const n = bounds.getNorth();
    prevBounds = makeBbox(w, s, e, n);
}

function drawWays() {
    const bboxes = getNewBboxes();
    const data = retrieveWaysForBboxes(bboxes, receiveWaysData);
    saveBounds();
}

function handleZoom(e) {
    const nextState = getStateFromMap();
    const nextPath = stateToUrl(nextState);
    window.history.replaceState(nextState, "", nextPath);
    if (nextState.zoom < 15) {
        console.log(`Not loading new ways at zoom ${nextState.zoom} < 15`);
        return;
    }
    drawWays();
}

function onLocationFound(e) {
    const mymap = getMyMap();
    if (typeof locationMarker === "undefined") {
        locationMarker = L.marker(e.latlng);
        locationMarker.addTo(mymap);
    } else {
        locationMarker.setLatLng(e.latlng);
    }
}

function flyToCity(name) {
    const mymap = getMyMap();
    mymap.setView(POIs[name], CONFIG_DEFAULT_ZOOM);
}

function citySelected() {
    var selector = document.getElementsByClassName("city_selector")[0];
    console.log("selected: " + selector.value);
    flyToCity(selector.value);
}

function initMap() {
    const mymap = getMyMap();

    addAllLayers(mymap);
    addControls(mymap);

    mymap.on("zoomend", handleZoom);
    mymap.on("moveend", handleZoom);
    mymap.on('locationfound', onLocationFound);

    drawWays();
}

initMap();