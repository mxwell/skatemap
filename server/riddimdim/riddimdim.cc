#include <fstream>
#include <inttypes.h>
#include <iostream>
#include <memory>
#include <string>
#include <unordered_map>

#include <arpa/inet.h>

#include <google/protobuf/io/coded_stream.h>
#include <google/protobuf/io/gzip_stream.h>
#include <google/protobuf/io/zero_copy_stream_impl_lite.h>

#include "httplib/httplib.h"
#include "model/model.h"
#include "nlohmann_json/include/nlohmann/json.hpp"
#include "osm_proto/fileformat.pb.h"
#include "osm_proto/osmformat.pb.h"

#include "grid.h"

using namespace std;
using namespace httplib;
using namespace google::protobuf::io;
using json = nlohmann::json;

const int kApiPort = 8082;
const string kMapDataPath = "footways.pbf";

class StreamBuffer {
    istream &stream;
    uint8_t *buffer;
    int buffer_size;

public:
    StreamBuffer(istream& stream) : stream(stream), buffer(nullptr), buffer_size(0) {}

    ~StreamBuffer() {
        Clear();
    }

    void Clear() {
        if (buffer) {
            delete[] buffer;
            buffer = nullptr;
            buffer_size = 0;
        }
    }

    bool Read(int size) {
        Clear();
        buffer = new uint8_t[size];
        buffer_size = size;
        stream.read((char*) buffer, size);
        return (bool) stream;
    }

    template<class T>
    bool ParseMessage(T &message) {
        CodedInputStream* coded_stream = new CodedInputStream(buffer, buffer_size);
        if (!message.ParseFromCodedStream(coded_stream)) {
            cerr << "failed to parse message" << endl;
            return false;
        }
        return true;
    }
};

struct ZlibBuffer {
    const string& data;
public:
    ZlibBuffer(const string& d) : data(d) {}
    template<class T>
    bool ParseMessage(T &message) {
        ArrayInputStream array_stream(data.data(), data.size());
        GzipInputStream zlib_stream(&array_stream, GzipInputStream::Format::ZLIB);
        if (!message.ParseFromZeroCopyStream(&zlib_stream)) {
            cerr << "failed to parse message from zlib" << endl;
            return false;
        }
        return true;
    }
};

void PrintHeaderBlock(const OSMPBF::HeaderBlock& hb) {
    if (hb.has_bbox()) {
        cout << "has bbox" << endl;
    }
    int n = hb.required_features_size();
    cout << n << " required_features" << endl;
    for (int i = 0; i < n; ++i) {
        cout << "  - " << hb.required_features(i) << endl;
    }
    n = hb.optional_features_size();
    cout << n << "optional_features" << endl;
    for (int i = 0; i < n; ++i) {
        cout << "  - " << hb.optional_features(i) << endl;
    }
    if (hb.has_writingprogram()) {
        cout << "writingprogram: " << hb.writingprogram() << endl;
    }
    if (hb.has_source()) {
        cout << "source: " << hb.source() << endl;
    }
}

bool HasDenseNodes(const OSMPBF::HeaderBlock& hb) {
    int n = hb.required_features_size();
    for (int i = 0; i < n; ++i) {
        if (hb.required_features(i) == "DenseNodes") {
            return true;
        }
    }
    return false;
}

const string kOSMHeader = "OSMHeader";
const string kOSMData = "OSMData";

class FileBlockReader {
    ifstream binary_stream;
    int blob_header_size;
    OSMPBF::BlobHeader blob_header;
    StreamBuffer *stream_buffer;
    string block_type;
    int blob_size;
    OSMPBF::Blob blob;
    OSMPBF::HeaderBlock header_block;
    OSMPBF::PrimitiveBlock primitive_block;

    bool ReadBlobHeaderSize() {
        uint32_t blob_header_length;
        binary_stream.read((char*) (&blob_header_length), sizeof(blob_header_length));
        if (!binary_stream) {
            // cerr << "only " << binary_stream.gcount() << " bytes are read" << endl;
            return false;
        }
        blob_header_size = (int) ntohl(blob_header_length);
        return true;
    }

    bool ReadBlobHeader() {
        stream_buffer->Read(blob_header_size);
        if (!stream_buffer->ParseMessage(blob_header)) {
            cerr << "failed to parse BlobHeader" << endl;
            return false;
        }
        if (!blob_header.has_type()) {
            cerr << "missing type in BlobHeader" << endl;
            return false;
        }
        block_type = blob_header.type();
        blob_size = blob_header.datasize();
        return true;
    }

    bool ParseBlob() {
        const string& zlib_data = blob.zlib_data();
        ZlibBuffer zbuffer(zlib_data);
        if (block_type == kOSMHeader) {
            if (!zbuffer.ParseMessage(header_block)) {
                cerr << "failed to parse HeaderBlock" << endl;
                return false;
            }
        } else if (block_type == kOSMData) {
            if (!zbuffer.ParseMessage(primitive_block)) {
                cerr << "failed to parse PrimitiveBlock" << endl;
                return false;
            }
        }
        return true;
    }

    bool ReadBlob() {
        stream_buffer->Read(blob_size);
        if (!stream_buffer->ParseMessage(blob)) {
            cerr << "failed to parse blob" << endl;
            return false;
        }
        if (!blob.has_zlib_data()) {
            cerr << "missing zlib_data in Blob" << endl;
            return false;
        }
        return ParseBlob();
    }
public:
    FileBlockReader(const string& data_path) {
        binary_stream = ifstream(data_path.c_str(), ios::binary);
        assert(binary_stream.is_open());
        stream_buffer = new StreamBuffer(binary_stream);
    }
    ~FileBlockReader() {
        delete stream_buffer;
    }

    bool ReadBlock() {
        blob_header_size = 0;
        block_type.clear();
        blob_size = 0;
        if (!ReadBlobHeaderSize()) return false;
        if (!ReadBlobHeader()) return false;
        if (!ReadBlob()) return false;
        return true;
    }

    string GetType() {
        return block_type;
    }

    const OSMPBF::HeaderBlock& GetHeaderBlock() {
        return header_block;
    }

    const OSMPBF::PrimitiveBlock& GetPrimitiveBlock() {
        return primitive_block;
    }
};

typedef unordered_map<int64_t, OsmModel::NodeHolder> NodesMap;
typedef vector<shared_ptr<string>> StringTable;

template<class T>
vector<OsmModel::Tag> CollectTags(const T& message, const StringTable& stringtable, int offset) {
    vector<OsmModel::Tag> result;
    int tags_nr = message.keys_size();
    for (int i = 0; i < tags_nr; ++i) {
        int key_id = message.keys(i);
        int val_id = message.vals(i);
        result.push_back({stringtable[offset + key_id], stringtable[offset + val_id]});
    }
    return result;
}

OsmModel::WayHolder ReadWay(const OSMPBF::Way &way, const NodesMap& nodes_map, const StringTable& stringtable, int offset, bool *broken) {
    int64_t id = way.id();
    int refs_nr = way.refs_size();
    vector<OsmModel::NodeHolder> node_collector;
    int64_t ref = 0;
    *broken = false;
    bool started = false;
    for (int i = 0; i < refs_nr; ++i) {
        ref += way.refs(i);
        if (!nodes_map.count(ref)) {
            *broken = true;
            // cerr << "Not found node #" << ref << " for way #" << id << ", skipping the way entirely"<< endl;
            if (started) {
                break;
            } else {
                continue;
            }
        }
        started = true;
        OsmModel::NodeHolder node = nodes_map.at(ref);
        node_collector.push_back(node);
    }
    if (node_collector.empty()) {
        return {};
    }
    vector<OsmModel::Tag> tags = CollectTags(way, stringtable, offset);
    return make_shared<OsmModel::Way>(id, move(tags), move(node_collector));
}

OsmModel::NodeHolder ReadNode(const OSMPBF::Node &proto_node, const StringTable& stringtable, int offset) {
    int64_t id = proto_node.id();
    vector<OsmModel::Tag> tags = CollectTags(proto_node, stringtable, offset);
    int64_t lat = proto_node.lat();
    int64_t lon = proto_node.lon();
    return make_shared<OsmModel::Node>(id, move(tags), lat, lon);
}

vector<OsmModel::NodeHolder> ReadDenseNodes(const OSMPBF::DenseNodes &proto_nodes) {
    vector<OsmModel::NodeHolder> result;
    int n = proto_nodes.id_size();
    int64_t id = 0;
    int64_t lat = 0;
    int64_t lon = 0;
    for (int i = 0; i < n; ++i) {
        id += proto_nodes.id(i);
        lat += proto_nodes.lat(i);
        lon += proto_nodes.lon(i);
        result.push_back(make_shared<OsmModel::Node>(id, vector<OsmModel::Tag>(), lat, lon));
    }
    return result;
}

struct OsmDataHolder {
    StringTable strings;
    NodesMap nodes;
    Grid<int64_t, int> grid;
    int skipped_ways = 0;
    int partial_ways = 0;

    OsmDataHolder(int cell_size) :
        grid(cell_size)
    {}
};

OsmDataHolder OpenPbfData2(const string& data_path) {
    FileBlockReader reader(data_path);
    OsmDataHolder result(1e4);
    while (reader.ReadBlock()) {
        if (reader.GetType() == kOSMData) {
            const OSMPBF::PrimitiveBlock& block = reader.GetPrimitiveBlock();
            const OSMPBF::StringTable& table = block.stringtable();
            int m = table.s_size();
            int stringTableOffset = result.strings.size();
            if (m) {
                for (int i = 0; i < m; ++i) {
                    result.strings.push_back(make_shared<string>(table.s(i)));
                }
            }
            int n = block.primitivegroup_size();
            cout << "Found OSMData: " << n << " group(s)" << endl;
            for (int i = 0; i < n; ++i) {
                const OSMPBF::PrimitiveGroup& group = block.primitivegroup(i);
                if (group.has_dense()) {
                    cout << "  - dense nodes: " << group.dense().id_size() << endl;
                    vector<shared_ptr<OsmModel::Node>> nodes = ReadDenseNodes(group.dense());
                    for (auto ptr : nodes) {
                        result.nodes[ptr->GetId()] = ptr;
                    }
                }
                cout << "  - nodes: " << group.nodes_size() << ", ways: " << group.ways_size() << ", relations: " << group.relations_size() << endl;
                if (group.nodes_size()) {
                    cerr << "Parsing of regular nodes is not supported yet. Abort." << endl;
                    exit(1);
                }
                for (int j = 0; j < group.ways_size(); ++j) {
                    bool broken = false;
                    OsmModel::WayHolder way = ReadWay(group.ways(j), result.nodes, result.strings, stringTableOffset, &broken);
                    if (!way) {
                        ++result.skipped_ways;
                        continue;
                    }
                    if (broken) {
                        ++result.partial_ways;
                    }
                    result.grid.AddWay(way);
                }
            }
        } else {
            cout << reader.GetType() << endl;
        }
    }
    cout << "Total number of strings: " << result.strings.size() << endl;
    cout << "Total number of nodes: " << result.nodes.size() << endl;
    cout << "Total number of ways: " << result.grid.CountWays() << endl;
    cout << "Number of skipped ways: " << result.skipped_ways << endl;
    cout << "Number of partial ways: " << result.partial_ways << endl;
    return result;
}

bool OpenPbfData(const string& data_path) {
    ifstream binary_stream(data_path.c_str(), ios::binary);
    uint32_t blob_header_size;
    {
        uint32_t blob_header_length;
        binary_stream.read((char*) (&blob_header_length), sizeof(blob_header_length));
        if (!binary_stream) {
            cerr << "only " << binary_stream.gcount() << " bytes are read" << endl;
            exit(1);
        }
        blob_header_size = ntohl(blob_header_length);
    }
    cout << "size of BlobHeader: " << blob_header_size << endl;

    StreamBuffer buffer(binary_stream);
    buffer.Read(blob_header_size);
    OSMPBF::BlobHeader blob_header;
    if (!buffer.ParseMessage(blob_header)) {
        cerr << "failed to parse blob header" << endl;
        return false;
    }
    cout << "Type: " << blob_header.type() << endl;
    int blob_size = blob_header.datasize();
    cout << "size of Blob: " << blob_size << endl;

    buffer.Read(blob_size);
    OSMPBF::Blob blob;
    if (!buffer.ParseMessage(blob)) {
        cerr << "failed to parse blob" << endl;
        return false;
    }
    cout << blob.raw_size() << endl;
    if (blob.has_zlib_data()) {
        const string& zlib_data = blob.zlib_data();
        ZlibBuffer zbuffer(zlib_data);
        if (blob_header.type() == "OSMHeader") {
            OSMPBF::HeaderBlock header_block;
            if (!zbuffer.ParseMessage(header_block)) {
                cerr << "failed to parse HeaderBlock" << endl;
                return false;
            }
            //PrintHeaderBlock(header_block);
        } else {
            cout << "not supported fileblock type" << endl;
        }
    }

    return true;
}

bool StartsWith(const string& s, const string& prefix) {
    size_t n = prefix.size();
    if (s.size() < n)
        return false;
    for (size_t i = 0; i < n; ++i) {
        if (s[i] != prefix[i])
            return false;
    }
    return true;
}

vector<Bbox<int64_t>> ReadBboxes(const Request& req) {
    vector<Bbox<int64_t>> result;
    try {
        json body = json::parse(req.body);
        for (auto& bbox : body["bboxes"]) {
            int64_t west = bbox["west"];
            int64_t east = bbox["east"];
            int64_t south = bbox["south"];
            int64_t north = bbox["north"];
            result.push_back({west, south, east, north});
        }
    } catch (const exception& e) {
        cerr << "exception during request body parsing: " << e.what() << endl;
        return {};
    }
    return result;
}

string BboxesToString(const vector<Bbox<int64_t>>& bboxes) {
    vector<string> result;
    for (auto& b : bboxes) {
        result.push_back(b.ToString());
    }
    return OsmModel::JoinStrings(result, "; ");
}

struct RequestParams {
    bool full = false;
};

RequestParams ReadParams(const Request& req) {
    RequestParams params;
    for (const auto& p : req.params) {
        if (p.first == "full") {
            params.full = (
                p.second == "true" ||
                p.second == "1"
            );
        }
    }
    return params;
}

json ToJson(const OsmModel::NodeHolder& node) {
    return {node->GetLat() / 1e7, node->GetLon() / 1e7};
}

json ToJson(const OsmModel::WayHolder& way, bool full=false) {
    json result;
    if (full) {
        result["id"] = way->GetId();
    }
    if (way->CountNodes()) {
        json nodes = json::array();
        for (const OsmModel::NodeHolder& node : *way) {
            nodes.push_back(ToJson(node));
        }
        result["nodes"] = nodes;
    }
    const vector<OsmModel::Tag>& tags = way->GetTags();
    if (!tags.empty()) {
        json obj;
        /* TODO strip unsupported tags if !full */
        for (const OsmModel::Tag& tag : tags) {
            obj[*tag.key] = *tag.value;
        }
        result["tags"] = obj;
    }
    return result;
}

json ToJson(const OsmModel::WayContainer& ways, bool full=false) {
    json result;
    for (const OsmModel::WayHolder &way : ways) {
        result[to_string(way->GetId())] = ToJson(way, full);
    }
    return {
        {"ways", result}
    };
}

int StartServer(const OsmDataHolder& data) {
    Server svr;
    if (!svr.is_valid()) {
        cerr << "server has an error..." << endl;
        return -1;
    }

    svr.Post("/ways", [&](const Request& req, Response& res) {
        vector<Bbox<int64_t>> bboxes = ReadBboxes(req);
        if (bboxes.empty()) {
            res.status = 400;
            return;
        }
        RequestParams params = ReadParams(req);
        OsmModel::WayContainer ways = data.grid.SelectWaysByBbox(bboxes);
        cerr << "Found " << ways.size() << " way(s)" << endl;
        json message = {
            {"status", "success"},
            {"params", BboxesToString(bboxes)},
            {"result", ToJson(ways, params.full)},
        };
        res.set_header("Access-Control-Allow-Origin", "*");
        res.set_content(message.dump(), "application/json");
        res.status = 200;
    });

    svr.set_error_handler([](const Request & /*req*/, Response &res) {
        json message = {
            {"status", "error"}
        };
        res.set_content(message.dump(), "application/json");
    });

    cout << "server is listening on port " << kApiPort << endl;
    svr.listen("localhost", kApiPort);
    return 0;
}

int main() {
    OsmDataHolder holder = OpenPbfData2(kMapDataPath);
    return StartServer(holder);
}
