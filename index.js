"use strict"

const fs = require('fs')
const path = require('path')
const http = require('http')
const stream = require('stream')

const B = a => b => c => a(b(c))
const B1 = a => b => c => d => a(b(c)(d))
const C = a => b => c => a(c)(b)
const K = a => () => a
const K1 = a => b => () => a(b)
const I = a => a
const T = a => b => b(a)
const N = a => b => new a(b)
const not = a => !a
const is = a => b => a === b
const isnt = B1(not)(is)
const truthy = Boolean
const falsy = B(not)(Boolean)
const instance = a => b => b instanceof a
const ifelse = a => (b,c) => d => a(d) ? b(d) : c(d)
const when = a => b => c => a(c) ? b(c) : c
const pipe = (x, ...fs) => { for (const f of fs) x = f(x) ; return x }
const arrow = (...fs) => x => pipe(x, ...fs)
const either = ifelse(B1(not)(instance)(Error))
const success = when(B1(not)(instance)(Error))
const failure = when(instance(Error))
const attempt = f => { try { return f() } catch (e) { return e }}
const pluck = a => b => b[a]
const tap = f => x => { f(x) ; return x }
const log = tap(console.log)
const first = pluck(0)
const last = x => x[x.length-1]
const null_undefined = x => x === null || x === undefined
const defined = B(not)(null_undefined)
const maybe = ifelse(defined)
const something = when(defined)
const nothing = when(null_undefined)
const split = a => b => b.split(a)
const trim = a => a.trim()
const map = f => function* (xs) { for (const x of xs) yield f(x) }
const filter = f => function* (xs) { for (const x of xs) if (f(x)) yield x }
const join = a => b => b.join(a)
const add = a => b => a + b
const unshift = x => function* (xs) { yield x ; yield* xs }

let CONF = null

function main()
	{ CONF = JSON.parse(fs.readFileSync('conf.json').toString('utf8'))
	const serve = http.createServer(request_listener)
	serve.listen(CONF.port, CONF.host, () =>
		console.log('listening on port', CONF.port, 'of', CONF.host)) }

const request_listener = (req, res) =>
	pipe(req,
	parse_cookies,
	authorise,
	either(
		arrow(parse_url, route, f => f(req, res)),
		K1(static_file)('./login_form.xhtml')),
	either(
		serve(res),
		handle_error(res)))

const static_file_or_dir = f => pipe(
	f,
	K1(fs.statSync),
	attempt,
	success(
		ifelse(x => x.isDirectory())
			(K1(static_directory)(f), K1(static_file)(f))))

const static_file = f => pipe(
	f,
	K1(fs.createReadStream),
	attempt,
	success(x => ({
		data: x,
		mimetype: determine_mime_type(f),
		status: 200,
		headers: [],
	})))

const static_directory = f => pipe(f,
	K1(fs.readdirSync),
	attempt,
	success(arrow(
		filter(arrow(first, isnt('.'))),
		map(x => path.join(f, x)),
		unshift('..'),
		directories_template,
		x => ({
			data: x,
			mimetype: 'text/html',
			status: 200,
			headers: []
		}))))

const stylesheet = `
body
	{ font-family: monospace;
	line-height: 1.5em;
	word-wrap: break-word; }
li + li { margin-top: 0.5em; }
`.trim()

const error = code => x => ({ data: x, status: code, mimetype: 'text/plain', headers: [] })
const handle_error = res => arrow(pluck('message'), error(500), serve(res))

const route = req => {
	switch (req.method) {
		case 'GET':
			return K1(static_file_or_dir)(req.pathname)
		case 'POST':
		default:
			return K1(N(Error))('method not allowed')
	}
}

const authorise = req => pipe(
	req,
	pluck('cookies'),
	pluck('p'),
	something(is(CONF.password)),
	ifelse(truthy)(K(req), (K1(N(Error))('unauthorised'))))

const parse_cookies = tap(req => req.cookies = pipe(
	req.headers,
	pluck('cookie'),
	maybe(
		arrow(
			trim,
			split(';'),
			map(arrow(trim, split('='))),
			Object.fromEntries),
		K([]))))

const parse_url = tap(req =>
	{ let pathname = ''
	for (const c of req.url)
		{ if (c === '?' || c === '#') break
		else pathname += c }
	req.pathname = decodeURIComponent(pathname) })

const MIMES = {
	xhtml: 'application/xhtml+xml',
	html: 'text/html',
	js: 'text/javascript',
	css: 'text/css',
}
const determine_mime_type = arrow(
	split('.'),
	last,
	pluck,
	T(MIMES),
	nothing(K('application/octet-stream')))

const serve = socket => response =>
	{ response.headers.push(['Content-Type', response.mimetype])
	socket.writeHead(response.status, response.headers)
	if (response.data instanceof stream)
		response.data.pipe(socket)
	else
		socket.end(response.data) }

const serialise_html = arrow(
	function* (elem) {
		yield '<'
		yield elem[0]
		if (elem[1] !== null)
			for (const [k,v] of elem[1]) {
				yield ' '
				yield k
				yield '='
				yield '"'
				yield v
				yield '"'
			}
		if (elem[2] === null) yield '/>'
		else {
			yield '>'
			for (const x of elem[2])
				if (typeof x === 'string') yield x
				else yield serialise_html(x)
			yield '</'
			yield elem[0]
			yield '>'
		}
	},
	Array.from,
	join(''))

const directories_template = arrow(
		map(x => ['li', null, [['a', [['href', x]], [last(x.split('/'))]]]]),
	x => ['html', null, [
		['head', null, [
			['meta', [['name', 'viewport'], ['content', 'width=device-width, initial-scale=1.0']], null],
			['style', null, [ stylesheet ]],
		]],
		['body', null, [['ul', null, [...x]]]]
	]],
	serialise_html,
	add('<!DOCTYPE html>'))

main()
