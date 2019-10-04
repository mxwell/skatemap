#! /usr/bin/python3

import argparse
import logging
import os
import requests
import shutil
import subprocess
import sys
import time
import urllib.request


OSMOSIS_BINARY = "osmosis/bin/osmosis"
MERGED_NAME = "footways.pbf"
MERGED_STATE_NAME = "state.txt"


class CitySpec(object):

    def __init__(self, path, top, left, bottom, right, bbox_name):
        self.path = path
        self.name = self.get_name_from_path(path)
        self.top = top
        self.left = left
        self.bottom = bottom
        self.right = right
        self.bbox_name = bbox_name

    @staticmethod
    def get_name_from_path(path):
        slash = path.rfind("/")
        return path[slash + 1:]

    def pbf_link(self):
        return "{}.osm.pbf".format(self.path)

    def pbf_name(self):
        return self.get_name_from_path(self.pbf_link())

    def state_link(self):
        return "{}.state.txt".format(self.path)

    def state_name(self):
        return self.get_name_from_path(self.state_link())

    def bbox_filename(self):
        return "{}.osm.bbox.pbf".format(self.bbox_name)


CITIES = [
    CitySpec("http://download.openstreetmap.fr/extracts/russia/central_federal_district/moscow",
             top=56.10, left=36.65, bottom=55.33, right=38.50, bbox_name="moscow"),
    CitySpec("http://download.openstreetmap.fr/extracts/russia/northwestern_federal_district/saint_petersburg",
             top=60.24, left=29.40, bottom=59.63, right=30.75, bbox_name="saint_petersburg"),
    CitySpec("http://download.openstreetmap.fr/extracts/russia/volga_federal_district/saratov_oblast",
             top=51.70, left=45.78, bottom=51.37, right=46.23, bbox_name="saratov"),
    CitySpec("http://download.openstreetmap.fr/extracts/russia/ural_federal_district/tyumen_oblast",
             top=57.29, left=65.34, bottom=57.06, right=65.83, bbox_name="tyumen"),
    CitySpec("http://download.openstreetmap.fr/extracts/europe/france/ile_de_france/paris",
             top=48.91, left=2.24, bottom=48.81, right=2.42, bbox_name="paris"),
]


class StateDownload(object):

    def __init__(self, root_dir):
        self.root_dir = root_dir
        self.output_dir = os.path.join(root_dir, "osm_data")
        self.loaded_states = []

    def get_state(self, link):
        response = requests.get(link)
        response.raise_for_status()
        self.loaded_states.append(response.text)
        return response.text

    def check_state(self, link, name):
        """
        Return true if update is needed
        """
        filepath = os.path.join(self.output_dir, name)
        if not os.path.exists(filepath):
            return True
        control = open(filepath).read()
        candidate = self.get_state(link)
        return control != candidate

    def download(self, link, name):
        filename = os.path.join(self.output_dir, name)
        logging.info("Downloading %s into %s...", link, filename)
        if not os.path.exists(self.output_dir):
            os.makedirs(self.output_dir)
        urllib.request.urlretrieve(link, filename)

    def cut_bbox(self, city_spec):
        command = [
            os.path.join(self.root_dir, OSMOSIS_BINARY),
            "--read-pbf", os.path.join(self.output_dir, city_spec.pbf_name()),
            "--tf",
            "accept-ways", "highway=footway,cycleway",
            "--used-node",
            "--bounding-box",
            "top={}".format(city_spec.top),
            "left={}".format(city_spec.left),
            "bottom={}".format(city_spec.bottom),
            "right={}".format(city_spec.right),
            "--write-pbf", os.path.join(self.output_dir, city_spec.bbox_filename()),
        ]
        subprocess.run(command, check=True)

    def update_city(self, city_spec):
        if not self.check_state(city_spec.state_link(), city_spec.state_name()):
            return False
        self.download(city_spec.pbf_link(), city_spec.pbf_name())
        self.download(city_spec.state_link(), city_spec.state_name())
        self.cut_bbox(city_spec)
        return True

    def update(self):
        result = False
        for city_spec in CITIES:
            logging.info("Updating %s...", city_spec.bbox_name)
            if self.update_city(city_spec):
                result = True
        return result

    def merge(self):
        merged = os.path.join(self.output_dir, MERGED_NAME)
        old_merged = "{}.old".format(merged)
        if os.path.exists(merged):
            if os.path.exists(old_merged):
                os.unlink(old_merged)
            logging.info("Saving previous merge result as %s...", old_merged)
            shutil.move(merged, old_merged)
        command =[
            os.path.join(self.root_dir, OSMOSIS_BINARY),
        ]
        for city_spec in CITIES:
            command.append("--read-pbf")
            command.append(os.path.join(self.output_dir, city_spec.bbox_filename()))
        command += ["--merge"] * (len(CITIES) - 1)  # this is magic!
        command += ["--write-pbf", merged]
        subprocess.run(command, check=True)

    def replace_merged(self):
        source = os.path.join(self.output_dir, MERGED_NAME)
        destination = os.path.join(self.root_dir, MERGED_NAME)
        state_destination = os.path.join(self.root_dir, MERGED_STATE_NAME)
        if os.path.exists(destination):
            os.unlink(destination)
        shutil.copyfile(source, destination)
        with open(state_destination, "w") as out:
            out.write("{}\n".format(int(time.time())))
            for state in self.loaded_states:
                out.write("{}\n".format(state))
        logging.info("Result: footways -> %s, state -> %s", destination, state_destination)

    def do(self):
        if not self.update():
            logging.info("Nothing was updated.")
            return
        self.merge()
        self.replace_merged()


def main():
    logging.basicConfig(
        format="%(asctime)-15s %(message)s",
        level=logging.INFO,
    )
    parser = argparse.ArgumentParser()
    parser.add_argument("--root-dir", required=True)
    args = parser.parse_args()

    state_download = StateDownload(args.root_dir)
    state_download.do()

    return 0


if __name__ == "__main__":
    sys.exit(main())
