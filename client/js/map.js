function makeMapboxTileLayer() {
    return L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token={accessToken}', {
        attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors, Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
        maxZoom: CONFIG_MAX_ZOOM,
        minZoom: CONFIG_MIN_ZOOM,
        id: 'mapbox.streets',
        accessToken: CONFIG_MAPBOX_TOKEN,
    });
}

function makeOsmTileLayer() {
    return L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: CONFIG_MAX_ZOOM,
        minZoom: CONFIG_MIN_ZOOM,
        attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors',
    });
}

var GRADE_LAYER_GROUPS = {};

function addAllLayers(destinationMap) {
    const baseLayers = {
        MapBox: makeMapboxTileLayer(),
        OSM: makeOsmTileLayer(),
    };
    baseLayers[CONFIG_BASE_LAYER].addTo(destinationMap);
    var namedLayers = {};
    GRADE_COLORS.forEach(function(item, index) {
        var group = L.layerGroup([]);
        GRADE_LAYER_GROUPS[item] = group;
        namedLayers[TRANSLATIONS_EN_RU[item]] = group;
        // don't show too hard ways by default
        if (item === G_BLACK || item == G_UNKNOWN) {
            return;
        }
        group.addTo(destinationMap);
    });
    L.control.layers(baseLayers, namedLayers).addTo(destinationMap);
}

function initStyles() {
    var result = {};
    result[G_GREEN] = {weight: WAY_WEIGHT, color: "green", opacity: OPACITY};
    result[G_BLUE] = {weight: WAY_WEIGHT, color: "blue", opacity: OPACITY};
    result[G_RED] = {weight: WAY_WEIGHT, color: "red", opacity: OPACITY};
    result[G_BLACK] = {weight: WAY_WEIGHT, color: "black", opacity: OPACITY};
    result[G_UNKNOWN] = {weight: WAY_WEIGHT, color: "black", dashArray: "4 5", opacity: OPACITY};
    return result;
}

const WAY_WEIGHT = 4;
const OPACITY = 0.8;
const STYLE_SET_BY_GRADE = initStyles();
const STYLE_HIGHLIGHTED = {weight: WAY_WEIGHT + 3, color: "#800000", opacity: OPACITY / 2};

function getGradeByProps(smoothness, surface) {
    if (typeof smoothness !== "undefined" && smoothness in GRADE_BY_SMOOTHNESS) {
        return GRADE_BY_SMOOTHNESS[smoothness];
    }
    if (typeof surface !== "undefined" && surface in GRADE_BY_SURFACE) {
        return GRADE_BY_SURFACE[surface];
    }
    return G_UNKNOWN;

}

function extractWayProps(way) {
    var smoothness = undefined;
    var surface = undefined;
    if ("tags" in way) {
        if ("smoothness" in way.tags) {
            smoothness = way.tags.smoothness;
        }
        if ("surface" in way.tags) {
            surface = way.tags.surface;
        }
    }
    const grade = getGradeByProps(smoothness, surface);
    return {
        grade: grade,
        smoothness: smoothness,
        surface: surface,
    };
}

var polylinesCache = {};

function getPolylineByNum(way, way_num) {
    if (!(way_num in polylinesCache)) {
        const nodes = way.nodes;
        const props = extractWayProps(way);
        var polyline = L.polyline(nodes, props);
        const style = STYLE_SET_BY_GRADE[props.grade];
        polyline.setStyle(style);
        polylinesCache[way_num] = polyline;
    }
    return polylinesCache[way_num];
}

var SurfaceInfo = L.control();

SurfaceInfo.onAdd = function(map) {
    this._div = L.DomUtil.create('div', 'surface-info');
    this.update();
    return this._div;
}

SurfaceInfo.update = function (props) {
    if (typeof props === "undefined") {
        this._div.innerHTML = '';
        this._div.setAttribute("hidden", "hidden");
        return;
    }
    var html = '';
    var row_counter = 0;
    if (typeof props.surface !== "undefined") {
        html += '<b>' + TRANSLATIONS_EN_RU[props.surface] + '</b>';
        row_counter += 1;
    }
    if (typeof props.smoothness !== "undefined") {
        if (row_counter > 0) {
            html += '<br />';
        }
        html += TRANSLATIONS_EN_RU[props.smoothness];
    }
    this._div.innerHTML = '<h4>Дорожка</h4>' + html;
    this._div.removeAttribute("hidden");
};

var highlighted = undefined;

function resetHighlight(e) {
    if (typeof highlighted !== "undefined") {
        const grade = highlighted.options.grade;
        highlighted.setStyle(STYLE_SET_BY_GRADE[grade]);
        SurfaceInfo.update();
        highlighted = undefined;
    }
}

function highlightPolyline(e) {
    var polyline = e.target;
    if (polyline === highlighted) {
        // this passes click further to map, which will reset highlightning
        return;
    }
    resetHighlight(e);
    SurfaceInfo.update(polyline.options);
    polyline.setStyle(STYLE_HIGHLIGHTED);
    highlighted = polyline;
    polyline.bringToFront();
    L.DomEvent.stopPropagation(e);
}

function addWays(waysData, destinationMap) {
    var added = 0;
    var were_added = 0;
    Object.keys(waysData).forEach(function(way_num, index) {
        var way = waysData[way_num];
        var polyline = getPolylineByNum(way, way_num);
        if (polyline.drawn) {
            ++were_added;
            return;
        }
        polyline.on("click", highlightPolyline);
        polyline.addTo(GRADE_LAYER_GROUPS[polyline.options.grade]);
        polyline.drawn = true;
        ++added;
    });
    console.log("Added " + added + " way(s), also " + were_added + " way(s) were added already");
}

var LocateMe = L.control({
    position: 'topleft',
    buttonTitle: 'My location',
});

LocateMe.onAdd = function(map) {
    var locateMeName = 'leaflet-control-locate-me',
        container = L.DomUtil.create('div', locateMeName + ' leaflet-bar'),
        options = this.options;

    var link = L.DomUtil.create('a', 'locate-me-class', container);
    link.innerHTML = '<img class="locate-me-icon" src="art/locate_icon.svg" alt="" />';
    link.href = '#';
    link.title = options.buttonTitle;

    link.setAttribute('role', 'button');
    link.setAttribute('aria-label', options.buttonTitle);
    L.DomEvent.disableClickPropagation(link);
    L.DomEvent.on(link, 'click', this._doLocate, this);
    return container;
}

LocateMe._doLocate = function(e) {
    this._map.locate({setView: true, maxZoom: 18});
}

function addControls(destinationMap) {
    LocateMe.addTo(destinationMap);
    SurfaceInfo.addTo(destinationMap);
    destinationMap.on("click", resetHighlight);
}
