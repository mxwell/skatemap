#! /bin/bash

set -xe

export HOST="skatemap.khairulin.com"

scp -r \
	client/art \
	client/css \
	client/index.html \
	client/js \
	server/bazel-bin/riddimdim/riddimdim \
	server/footways.pbf \
	$HOST:skatemap_bundle
