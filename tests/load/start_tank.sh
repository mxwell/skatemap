#! /bin/bash

echo "Run inside container: yandex-tank -c riddimdim.yaml riddimdim.ammo"
docker run \
    -v $(pwd):/var/loadtest \
    -v $SSH_AUTH_SOCK:/ssh-agent -e SSH_AUTH_SOCK=/ssh-agent \
    --net host \
    -it \
    --entrypoint /bin/bash \
    direvius/yandex-tank
