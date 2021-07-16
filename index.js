'use strict'

class HttpError extends Error
	{ constructor(message, status)
		{ super(message)
		this.message = message
		this.status = status }}

const fs = require('fs')
const path = require('path')
const http = require('http')
const stream = require('stream')
const zlib = require('zlib')

const CONF = JSON.parse(fs.readFileSync('conf.json').toString('utf8'))

const last = x => x[x.length-1]

function main()
	{ const serve = http.createServer(request_listener)
	serve.listen(CONF.port, CONF.host, () =>
		console.log('listening on port', CONF.port, 'of', CONF.host)) }

async function request_listener(req, socket)
	{ let response = null
	try
		{ parse_cookies(req)
		authorise(req)
		parse_url(req)
		response = await route(req) }
	catch (e) { response = handle_error(e) }
	serve(socket, response) }

function static_file_or_dir(f)
	{ const stat = fs.statSync(f)
	if (stat.isDirectory())
		return static_directory(f)
	else
		return static_file(f) }

function static_file(f)
	{ return {
		data: fs.createReadStream(f),
		mimetype: determine_mime_type(f),
		status: 200,
		headers: [],
	}}

function static_directory(f)
	{ const listing = fs.readdirSync(f)
		.filter(x => x[0] !== '.')
		.map(x => path.join(f, x))
	listing.unshift('..')
	return {
		data: directories_template(listing),
		mimetype: 'text/html',
		status: 200,
		headers: [],
	}}

const stylesheet = `
body
	{ font-family: monospace;
	line-height: 1.5em;
	word-wrap: break-word; }
li + li { margin-top: 0.5em; }
`.trim()

function handle_error(e)
	{ if (e.status === 401)
		return static_file('./login_form.xhtml')
	else return {
		data: e.message,
		status: e.status || 500,
		mimetype: 'text/plain',
		headers: []
	}}

function route(req)
	{ switch (req.method)
		{ case 'GET': return static_file_or_dir(req.pathname)
		case 'POST': return user_function(req)
		default: throw new HttpError('Method not allowed', 405) }}

function authorise(req)
	{ if (req.cookies.p !== CONF.password)
		throw new HttpError('Unauthorised', 401) }

function parse_cookies(req)
	{ const cookie = req.headers.cookie
	if (cookie)
		req.cookies = Object.fromEntries(cookie.trim().split(';').map(x => x.trim().split('=')))
	else
		req.cookies = [] }

function parse_url(req)
	{ let pathname = ''
	for (const c of req.url)
		{ if (c === '?' || c === '#') break
		else pathname += c }
	req.pathname = decodeURIComponent(pathname) }

const MIMES =
	{ xhtml: 'application/xhtml+xml',
	html: 'text/html',
	js: 'text/javascript',
	css: 'text/css',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	png: 'image/png',
	gif: 'image/gif',
	mp4: 'video/mp4',
	webm: 'video/webm',
	mkv: 'video/x-matroska',
	json: 'application/json', }

function determine_mime_type(x)
	{ return MIMES[last(x.split('.')).toLowerCase()] || 'application/octet-stream' }

function serve(socket, response)
	{ response.headers.push(['Content-Type', response.mimetype], ['Content-Encoding', 'br'])
	socket.writeHead(response.status, response.headers)
	const compressed = zlib.createBrotliCompress()
	if (response.data instanceof stream)
		response.data.pipe(compressed)
	else
		compressed.end(Buffer.from(response.data))
	compressed.pipe(socket) }

function serialise_html(elem)
	{ const xs = []
	xs.push('<')
	xs.push(elem[0])
	if (elem[1] !== null)
		for (const [k,v] of elem[1])
			{ xs.push(' ')
			xs.push(k)
			xs.push('=')
			xs.push('"')
			xs.push(v)
			xs.push('"') }
	if (elem[2] === null) xs.push('/>')
	else
		{ xs.push('>')
		for (const x of elem[2])
			if (typeof x === 'string') xs.push(x)
			else xs.push(serialise_html(x))
		xs.push('</')
		xs.push(elem[0])
		xs.push('>') }
	return xs.join('') }

function directories_template(xs)
	{ let tree = xs.map(x => ['li', null, [['a', [['href', x]], [last(x.split('/'))]]]])
	tree = ['html', null, [
		['head', null, [
			['meta', [['name', 'viewport'], ['content', 'width=device-width, initial-scale=1.0']], null],
			['meta', [['charset', 'utf-8']], null],
			['style', null, [ stylesheet ]],
		]],
		['body', null, [['ul', null, tree]]],
	]]
	return '<!DOCTYPE html>' + serialise_html(tree) }

function read_post_data(req)
	{ return new Promise((yes) =>
		{ const chunks = []
		req.on('data', x => chunks.push(x))
		req.on('end', x => yes(Buffer.concat(chunks))) }) }

function user_function(req)
	{ return read_post_data(req).then(x => ({
		status: 200,
		mimetype: 'application/json',
		headers: [],
		data: JSON.stringify(eval(x.toString()))
	})) }

function* walk_directory(dir)
	{ for (const name of fs.readdirSync(dir))
		{ if (name[0] === '.') continue
		const pathname = path.join(dir, name)
		const stats = fs.statSync(pathname)
		if (stats.isDirectory()) yield* walk_directory(pathname)
		else if (stats.isFile()) yield pathname }}

main()
