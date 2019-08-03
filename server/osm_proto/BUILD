proto_library(
	name = "osm_proto",
	srcs = ["fileformat.proto", "osmformat.proto"],
)

cc_proto_library(
	name = "osm_cc_proto",
	deps = [":osm_proto"],
	visibility = ["//riddimdim:__pkg__"],
)