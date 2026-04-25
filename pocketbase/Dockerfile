FROM alpine:3.20

ARG PB_VERSION=0.31.0

RUN apk add --no-cache ca-certificates unzip wget

RUN wget -q -O /tmp/pocketbase.zip \
  "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip" \
  && unzip /tmp/pocketbase.zip -d /usr/local/bin \
  && chmod +x /usr/local/bin/pocketbase \
  && rm -f /tmp/pocketbase.zip

WORKDIR /pb

EXPOSE 8090

CMD ["pocketbase", "serve", "--http=0.0.0.0:8090", "--dir=/pb_data"]
