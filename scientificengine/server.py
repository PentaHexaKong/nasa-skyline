'''Bounded HTTP adapter for the versioned SKYLINE scientific Python interface.'''
import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import sys
import threading

from bootstrap import EXPECTED_VERSION, createEngine

REQUEST_VERSION = 'skyline-science-request/1.0.0'
MAX_BYTES = 1 << 20


def rejectNonfinite(value):
    raise ValueError('Nonfinite JSON constants are unsupported')


def makeHandler(engine, missionReady):
    admission = threading.BoundedSemaphore(1)
    readiness = {'missionReady': bool(missionReady)}

    class Handler(BaseHTTPRequestHandler):
        def setup(self):
            super().setup()
            self.connection.settimeout(10.)

        def sendJson(self, status, payload):
            body = json.dumps(payload, allow_nan=False, separators=(',', ':')).encode()
            if len(body) > MAX_BYTES:
                status = 503
                body = json.dumps({'dataState': 'unavailable', 'error': {'code': 'response_too_large', 'message': 'Scientific response exceeds 1 MiB'}}).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('X-Request-ID', self.headers.get('X-Request-ID', 'scientific-local')[:128])
            self.end_headers()
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass

        def fail(self, status, code, message):
            self.sendJson(status, dict(schemaVersion=EXPECTED_VERSION, dataState='unavailable', result=None,
                error=dict(code=code, message=message), provenance=dict(engineVersion=EXPECTED_VERSION)))

        def do_GET(self):
            if self.path != '/healthz':
                return self.fail(404, 'not_found', 'Unknown scientific route')
            self.sendJson(200, dict(status='ok', service='scientificengine', engineVersion=EXPECTED_VERSION, **readiness))

        def do_POST(self):
            if self.path != '/analyze':
                return self.fail(404, 'not_found', 'Unknown scientific route')
            if self.headers.get('Content-Type', '').split(';', 1)[0].strip().lower() != 'application/json':
                return self.fail(415, 'unsupported_media_type', 'Content-Type must be application/json')
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length <= MAX_BYTES:
                    return self.fail(413 if length > MAX_BYTES else 400, 'invalid_request', 'Request must contain at most 1 MiB of JSON')
                payload = json.loads(self.rfile.read(length), parse_constant=rejectNonfinite)
                if not isinstance(payload, dict) or set(payload) != {'input'} or not isinstance(payload['input'], dict):
                    raise ValueError('Expected exactly one object-valued input field')
            except (ValueError, UnicodeDecodeError):
                return self.fail(400, 'invalid_request', 'Send exactly one JSON object shaped as {"input": {...}}')
            request = payload['input']
            if request.get('operation') == 'mission' and not readiness['missionReady']:
                return self.fail(503, 'mission_not_ready', 'Start the scientific service with mission warm-up enabled')
            if not admission.acquire(blocking=False):
                return self.fail(503, 'engine_busy', 'A scientific evaluation is already running')
            try:
                result = engine.evaluate(request)
                code = result.get('error', {}).get('code')
                if code in ('engine_timeout', 'worker_failed', 'integrity_failure', 'data_unavailable', 'terrain_unavailable'):
                    readiness['missionReady'] = False
                status = 200 if result['dataState'] == 'computed' else 503
                if code == 'invalid_request':
                    status = 400
                elif code == 'terrain_unavailable' or (result.get('result') or {}).get('status') == 'terrain_invalid':
                    status = 422
                elif code == 'engine_timeout':
                    status = 504
                self.sendJson(status, result)
            finally:
                admission.release()

        def log_message(self, fmt, *args):
            print(json.dumps(dict(service='scientificengine', requestId=self.headers.get('X-Request-ID'), message=fmt % args)), file=sys.stderr, flush=True)

    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8003)
    parser.add_argument('--no-mission-warmup', action='store_true')
    args = parser.parse_args()
    with createEngine() as engine:
        result = engine.evaluate(dict(schemaVersion=REQUEST_VERSION, operation='describe'))
        if result['dataState'] != 'computed':
            raise RuntimeError(result)
        if not args.no_mission_warmup:
            print('Preparing the verified mission world before accepting HTTP requests', file=sys.stderr, flush=True)
            warm = engine.evaluate(dict(schemaVersion=REQUEST_VERSION, operation='mission', parameters=dict(
                scope='S1_CR1_CONNECTING_RIDGE', orbit='C4', mastHeightM=0)))
            if warm['dataState'] != 'computed':
                raise RuntimeError(warm)
        server = ThreadingHTTPServer((args.host, args.port), makeHandler(engine, not args.no_mission_warmup))
        server.daemon_threads = True
        print(json.dumps(dict(service='scientificengine', address=args.host, port=server.server_port, ready=True)), file=sys.stderr, flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            server.server_close()


if __name__ == '__main__':
    main()
