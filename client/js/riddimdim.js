const RIDDIMDIM_URL = "/ways";

function convertCoord(x) {
	return Math.floor(x * 1e7);
}

function convertBbox(b) {
	return {
		west: convertCoord(b.west),
		south: convertCoord(b.south),
		east: convertCoord(b.east),
		north: convertCoord(b.north)
	};
}

function postToWaysApi(body, callback) {
	return fetch(RIDDIMDIM_URL, {
		method: "POST",
		mode: "cors",
		body: JSON.stringify(body),
	}).then(response => response.json()).then(callback);
}

function retrieveWaysForBboxes(bboxes, callback) {
	if (bboxes.length <= 0) {
		return;
	}
	var converted = [];
	for (var i = 0 ; i < bboxes.length; ++i) {
		converted.push(convertBbox(bboxes[i]));
	}
	const body = {bboxes: converted};
	return postToWaysApi(body, callback);
}
