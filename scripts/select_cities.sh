#! /bin/bash

set -xe

export TOOL="osmosis/bin/osmosis"
export INPUT="russia-latest.osm.pbf"
export COMMAND="${TOOL} --read-pbf ${INPUT} --tf accept-ways highway=footway,cycleway --used-node"
export OUTPUT_DIR="output"

mkdir -p $OUTPUT_DIR
$COMMAND --bounding-box top=56.10 left=36.65 bottom=55.33 right=38.50 --write-pbf "${OUTPUT_DIR}/moscow.pbf"
$COMMAND --bounding-box top=60.24 left=29.40 bottom=59.63 right=30.75 --write-pbf "${OUTPUT_DIR}/saint_petersburg.pbf"
$COMMAND --bounding-box top=51.70 left=45.78 bottom=51.37 right=46.23 --write-pbf "${OUTPUT_DIR}/saratov.pbf"
$COMMAND --bounding-box top=57.29 left=65.34 bottom=57.06 right=65.83 --write-pbf "${OUTPUT_DIR}/tyumen.pbf"

$TOOL \
	--read-pbf "${OUTPUT_DIR}/moscow.pbf" \
	--read-pbf "${OUTPUT_DIR}/saint_petersburg.pbf" \
	--read-pbf "${OUTPUT_DIR}/saratov.pbf" \
	--read-pbf "${OUTPUT_DIR}/tyumen.pbf" \
	--merge --merge --merge \
	--write-pbf "${OUTPUT_DIR}/cities.pbf"
