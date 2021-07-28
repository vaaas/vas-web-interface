'use strict'

module.exports = async function request_listener(req)
	{ let response = null
	try
		{ parse_cookies(req)
		authorise(req)
		parse_url(req)
		response = await route(req) }
	catch (e) { response = handle_error(e) }
	return response }

class HttpError extends Error
	{ constructor(message, status)
		{ super(message)
		this.message = message
		this.status = status }}

const fs = require('fs')
const path = require('path')
const determine_mime_type = require('determine-mime-type')
const parse_url = require('parse-url')
const read_post_data = require('read-post-data')
const serialise_html = require('serialise-html')
const parse_cookies = require('parse-cookies')

const CONF = JSON.parse(fs.readFileSync('conf.json').toString('utf8'))

const last = x => x[x.length-1]

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
