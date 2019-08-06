#! /bin/bash

set -xe

HOST="skatemap.khairulin.com"
ROOTDIR="/skatemap_bundle"

scp -r \
	client/art \
	client/css \
	client/index.html \
	client/js \
	$HOST:$ROOTDIR/client

scp -r \
	scripts \
	server/bazel-bin/riddimdim/riddimdim \
	$HOST:$ROOTDIR/server
