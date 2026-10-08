FROM python:3.12-alpine
RUN apk add --no-cache docker-cli docker-cli-compose git
WORKDIR /opt/updater
COPY server.py ./server.py
USER root
EXPOSE 8765
CMD ["python", "-u", "server.py"]
