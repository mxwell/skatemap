#pragma once

#include <memory>
#include <string>
#include <vector>

using namespace std;

namespace OsmModel {
	string JoinStrings(const vector<string>& strings, const string& delimiter) {
		if (strings.empty()) {
			return {};
		}
		string result = strings[0];
		for (int i = 1; i < int(strings.size()); ++i) {
			result += delimiter;
			result += strings[i];
		}
		return result;
	}

	struct Tag {
		const shared_ptr<string> key;
		const shared_ptr<string> value;
	};

	class OsmObject {
		int64_t id_;
		vector<Tag> tags_;
	public:
		OsmObject(int64_t id, vector<Tag>&& tags) :
			id_(id),
			tags_(tags)
		{}

		int64_t GetId() {
			return id_;
		}

		const vector<Tag>& GetTags() const {
			return tags_;
		}

		string ToString(const string& prefix={}) const {
			vector<string> result;
			result.push_back(prefix + "{");
			result.push_back(prefix + "  \"id\": " + to_string(id_) + ",");
			if (!tags_.empty()) {
				vector<string> tag_strings;
				for (const Tag& tag : tags_) {
					tag_strings.push_back("\"" + *tag.key + "\": \"" + *tag.value + "\"");
				}
				result.push_back(prefix + "  \"tags\": { " + JoinStrings(tag_strings, ", ") + " },");
			}
			for (const string& s : DetailsToString(prefix)) {
				result.push_back(s);
			}
			result.push_back(prefix + "}");
			return JoinStrings(result, "\n");
		}

		virtual vector<string> DetailsToString(const string& prefix) const {
			(void) prefix;
			return {};
		}
	};

	class Node : public OsmObject {
		int64_t lat_;
		int64_t lon_;
	public:
		Node(int64_t id, vector<Tag>&& tags, int64_t lat, int64_t lon) :
			OsmObject(id, move(tags)),
			lat_(lat),
			lon_(lon)
		{}

		virtual vector<string> DetailsToString(const string& prefix) const override {
			return {
				prefix + "  \"lat\": " + to_string(lat_),
				prefix + "  \"lon\": " + to_string(lon_)
			};
		}

		int64_t GetLat() const {
			return lat_;
		}

		int64_t GetLon() const {
			return lon_;
		}
	};

	typedef shared_ptr<Node> NodeHolder;

	class Way : public OsmObject {
		vector<NodeHolder> nodes_;
	public:
		Way(int64_t id, vector<Tag>&& tags, vector<shared_ptr<Node>>&& nodes) :
			OsmObject(id, move(tags)),
			nodes_(nodes)
		{}

		virtual vector<string> DetailsToString(const string& prefix) const override {
			vector<string> node_strings;
			for (const NodeHolder &node : nodes_) {
				node_strings.push_back(node->ToString(prefix + "  "));
			}
			return {prefix + "  \"nodes\": [",
			        JoinStrings(node_strings, ",\n"),
			        prefix + "  ]"};
		}

		vector<NodeHolder>::iterator Begin() {
			return nodes_.begin();
		}

		vector<NodeHolder>::iterator End() {
			return nodes_.end();
		}

		vector<NodeHolder>::iterator begin() {
			return Begin();
		}

		vector<NodeHolder>::iterator end() {
			return End();
		}

		int CountNodes() const {
			return static_cast<int>(nodes_.size());
		}
	};

	typedef shared_ptr<Way> WayHolder;
	typedef vector<WayHolder> WayContainer;
}