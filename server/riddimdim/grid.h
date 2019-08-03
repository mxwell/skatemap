#pragma once

#include <set>
#include <map>
#include "model/model.h"

using namespace std;

template<class T>
struct Bbox {
    T west_;
    T south_;
    T east_;
    T north_;

    Bbox(T west, T south, T east, T north) :
        west_(west),
        south_(south),
        east_(east),
        north_(north)
    {}

    string ToString() const {
        return "bbox {" + to_string(west_) + " " + to_string(south_) + " " + to_string(east_) + " " + to_string(north_) + "}";
    }
};

template<class T, class U>
class Grid {
    typedef pair<U, U> GridKey;

    T cell_size_;
    OsmModel::WayContainer way_container_;
    map<GridKey, OsmModel::WayContainer> grid_;

    GridKey GetGridKey(const T& lat, const T& lon) const {
        return GridKey(U(lat / cell_size_), U(lon / cell_size_));
    }

    GridKey GetGridKey(const OsmModel::NodeHolder &node) const {
        return GetGridKey(node->GetLat(), node->GetLon());
    }

public:
    explicit Grid(T cell_size) : cell_size_(cell_size) {}

    void AddWay(const OsmModel::WayHolder& way) {
        way_container_.push_back(way);
        set<GridKey> keys;
        for (auto it = way->Begin(); it != way->End(); ++it) {
            const OsmModel::NodeHolder& node = *it;
            GridKey key = GetGridKey(node);
            keys.insert(key);
        }
        for (const GridKey& key : keys) {
            grid_[key].push_back(way);
        }
    }

    OsmModel::WayContainer SelectWaysByBbox(const vector<Bbox<T>>& bboxes) const {
        set<OsmModel::WayHolder> collector;
        for (const Bbox<T>& bbox : bboxes) {
            GridKey start = GetGridKey(bbox.south_, bbox.west_);
            GridKey end = GetGridKey(bbox.north_, bbox.east_);
            GridKey cur;
            for (cur.first = start.first; cur.first <= end.first; ++cur.first) {
                for (cur.second = start.second; cur.second <= end.second; ++cur.second) {
                    if (!grid_.count(cur)) continue;
                    const OsmModel::WayContainer& cell_ways = grid_.at(cur);
                    for (const OsmModel::WayHolder& way : cell_ways) {
                        collector.insert(way);
                    }
                }
            }
        }
        OsmModel::WayContainer result;
        for (const OsmModel::WayHolder& way : collector) {
            result.push_back(way);
        }
        return result;
    }

    int CountWays() const {
        return int(way_container_.size());
    }
};