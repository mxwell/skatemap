cc_library(
	name = "grid",
	srcs = ["grid.cc"],
	hdrs = ["grid.h"],
	deps = [
		"//model:model",
	]
)

cc_binary(
	name = "riddimdim",
	srcs = ["riddimdim.cc"],
	deps = [
		":grid",
		"//httplib:httplib",
		"//nlohmann_json:json",
		"//osm_proto:osm_cc_proto",
		"//model:model",
	],
	linkopts = ["-lpthread"]
)