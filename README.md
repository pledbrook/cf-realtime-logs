Node.js log viewer for Cloud Foundry
====================================

This is a simple Node.js application that listens to log messages coming from a RabbitMQ broker and updates its browser page in "realtime". The log messages are also stored in a MongoDB service.

Note that this application assumes that only one RabbitMQ service and one MongoDB service are bound to it.
