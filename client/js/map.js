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

const WAY_WEIGHT = 5;
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
    var incline = undefined;
    if ("tags" in way) {
        if ("incline" in way.tags) {
            incline = way.tags.incline;
        }
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
        incline: incline,
        smoothness: smoothness,
        surface: surface,
    };
}

class ListNode {
    constructor(key, item) {
        this.key = key;
        this.item = item;
        this.prev = null;
        this.next = null;
    }
}

/* based on https://chrisrng.svbtle.com/lru-cache-in-javascript */
class LruCache {
    constructor(capacity, removal) {
        this.capacity = capacity;
        this.removal = removal;
        this.size = 0;
        this.obj = {};
        this.head = null;
        this.tail = null;
    }

    setHead(node) {
        node.prev = null;
        node.next = this.head;
        if (this.head !== null) {
            this.head.prev = node;
        }
        this.head = node;
        if (this.tail === null) {
            this.tail = node;
        }
    }

    unlink(node) {
        if (node.prev !== null) {
            node.prev.next = node.next;
        } else {
            this.head = node.next;
        }
        if (node.next !== null) {
            node.next.prev = node.prev;
        } else {
            this.tail = node.prev;
        }
    }

    add(key, item) {
        if (this.size >= this.capacity) {
            while (this.size > this.capacity * 0.9) {
                var oldKey = this.tail.key;
                this.removal(this.obj[oldKey].item);
                delete this.obj[oldKey];
                this.size--;
                this.tail = this.tail.prev;
                this.tail.next = null;
            }
        }
        var node = new ListNode(key, item);
        this.setHead(node);
        this.size++;
        this.obj[node.key] = node;
    }

    has(key) {
        return key in this.obj;
    }

    get(key) {
        var node = this.obj[key];
        var item = node.item;
        this.unlink(node);
        this.setHead(node);
        return item;
    }
}

var polylinesCache = new LruCache(6000, function(item) {
    // remove line from its layer
    item.remove();
});

function parseIncline(tag) {
    const p = tag.indexOf("%");
    if (p < 0) {
        return NaN;
    }
    return Number(tag.substr(0, p));
}

function inclineIsUp(tag) {
    if (tag === "up") {
        return true;
    }
    return parseIncline(tag) > CONFIG_INCLINE_THRESHOLD;
}

function inclineIsDown(tag) {
    if (tag === "down") {
        return true;
    }
    return parseIncline(tag) < -CONFIG_INCLINE_THRESHOLD;
}

function getPolylineByNum(way, way_num) {
    if (!polylinesCache.has(way_num)) {
        const props = extractWayProps(way);
        const incline = props.incline;
        if (typeof incline === "string") {
            if (inclineIsUp(incline)) {
                props.steep = true;
            } else if (inclineIsDown(incline)) {
                props.steep = true;
                way.nodes = way.nodes.reverse();
            } else {
                props.steep = false;
            }
        }
        const nodes = way.nodes;
        var polyline = L.polyline(nodes, props);
        const style = STYLE_SET_BY_GRADE[props.grade];
        polyline.setStyle(style);
        polyline.options.origColor = polyline.options.color;
        polylinesCache.add(way_num, polyline);
    }
    return polylinesCache.get(way_num);
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
    if (props.steep) {
        if (row_counter > 0) {
            html += '<br />';
        }
        const value = parseIncline(props.incline);
        if (!isNaN(value)) {
            html += "уклон:&nbsp;" + Math.abs(value);
        } else {
            html += "есть уклон";
        }
    }
    this._div.innerHTML = '<h4>Дорожка</h4>' + html;
    this._div.removeAttribute("hidden");
};

var highlighted = undefined;

function resetHighlight() {
    if (typeof highlighted !== "undefined") {
        const grade = highlighted.options.grade;
        highlighted.setStyle(STYLE_SET_BY_GRADE[grade]);
        SurfaceInfo.update();
        highlighted = undefined;
    }
}

function highlightPolyline(e, polyline) {
    if (polyline === highlighted) {
        // this passes click further to map, which will reset highlightning
        return;
    }
    resetHighlight();
    SurfaceInfo.update(polyline.options);
    polyline.setStyle(STYLE_HIGHLIGHTED);
    highlighted = polyline;
    polyline.bringToFront();
    L.DomEvent.stopPropagation(e);
}

function clickPolyline(e) {
    const polyline = e.target;
    highlightPolyline(e, polyline);
}

function addArrows(polyline, destinationMap) {
    return L.polylineDecorator(polyline, {
        patterns: [
            {
                offset: '20%',
                repeat: 50,
                symbol: L.Symbol.arrowHead({pixelSize: 15, polygon: false, pathOptions: {stroke: true, color: polyline.options.origColor}})
            }
        ]
    }).addTo(destinationMap);
}

function clickArrow(e) {
    const arrow = e.target;
    console.log("arrow: " + typeof(arrow))
    highlightPolyline(e, arrow.baseline);
}

function addWays(waysData) {
    var added = 0;
    var were_added = 0;
    Object.keys(waysData).forEach(function(way_num, index) {
        var way = waysData[way_num];
        var polyline = getPolylineByNum(way, way_num);
        if (polyline.drawn) {
            ++were_added;
            return;
        }
        const destinationMap = GRADE_LAYER_GROUPS[polyline.options.grade];
        polyline.on("click", clickPolyline);
        polyline.addTo(destinationMap);

        if (CONFIG_ENABLE_INCLINE && polyline.options.steep) {
            var arrow = addArrows(polyline, destinationMap);
            arrow.baseline = polyline;
            arrow.on("click", clickArrow);
        }

        polyline.drawn = true;
        ++added;
    });
    console.log("Added " + added + " way(s), also " + were_added + " way(s) were added already");
}

function clearWays() {
    GRADE_COLORS.forEach(function(item, index) {
        const group = GRADE_LAYER_GROUPS[item];
        group.eachLayer(function (layer) {
            layer.drawn = false;
        });
        group.clearLayers();
    });
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
