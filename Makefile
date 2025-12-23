#!make

.DEFAULT_GOAL := restart

include .env
export $(shell sed 's/=.*//' .env)


SHELL := env PATH=$(PATH) /bin/bash

down:
	${DOCKER_COMPOSE} down --remove-orphans

up:
	${DOCKER_COMPOSE} up -d

.PHONY: build
build:
	${DOCKER_COMPOSE} build

rebuild:
	${DOCKER_COMPOSE} up -d --build --remove-orphans

force-rebuild:
	make down
	${DOCKER_COMPOSE} build --no-cache
	make up

restart:
	make down
	make up

bash:
	${DOCKER_COMPOSE} exec -it alchemyex_api /bin/sh

sh:
	${DOCKER_COMPOSE} exec -it alchemyex_api /bin/sh

ps:
	${DOCKER_COMPOSE} ps

.PHONY: logs
logs:
	${DOCKER_COMPOSE} logs -f

logs-app:
	${DOCKER_COMPOSE} logs -f alchemyex_api
