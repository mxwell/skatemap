var mymap = L.map('mapid', {
	center: POIs.moscow,
	zoom: CONFIG_DEFAULT_ZOOM,
	minZoom: CONFIG_MIN_ZOOM,
	maxZoom: CONFIG_MAX_ZOOM,
});

var prevBounds = undefined;

function receiveWaysData(data) {
	if (data.status !== "success") {
		console.log("Failed to get ways data. Status: " + data.status);
		prevBounds = undefined;
		return;
	}
	var ways_data = data.result.ways;
	addWays(ways_data, mymap);
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
	const z = mymap.getZoom();
	if (z < 15) {
		console.log(`Not loading new ways at zoom ${z} < 15`);
		return;
	}
	drawWays();
}

function onLocationFound(e) {
    var radius = e.accuracy;

    L.marker(e.latlng).addTo(mymap)
        .bindPopup("You are within " + radius + " meters from this point");

    L.circle(e.latlng, radius).addTo(mymap);
}

function flyToCity(name) {
	mymap.setView(POIs[name], CONFIG_DEFAULT_ZOOM);
}

function citySelected() {
	var selector = document.getElementsByClassName("city_selector")[0];
	console.log("selected: " + selector.value);
	flyToCity(selector.value);
}

function initMap() {
	addAllLayers(mymap);
	addControls(mymap);

	mymap.on("zoomend", handleZoom);
	mymap.on("moveend", handleZoom);
	mymap.on('locationfound', onLocationFound);
	drawWays();
}

initMap();