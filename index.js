'use strict'

const fs = require('fs')
const path = require('path')
const parse_url = require('parse-url')
const read_post_data = require('read-post-data')
const serialise_html = require('serialise-html')
const parse_cookies = require('parse-cookies')
const error_responses = require('error-responses')
const get_file = require('get-file')

const CONF = JSON.parse(fs.readFileSync(__dirname + '/conf.json').toString('utf8'))

module.exports = async function request_listener(req)
{	const auth = authorise(parse_cookies(req))
	return auth === true ? route(parse_url(req)) : auth }

function static_file_or_dir(f)
{	try
	{ const stat = fs.statSync(f)
		if (stat.isDirectory())
			return static_directory(f)
		else
			return get_file(f) }
	catch(e) { return error_responses.not_found }}

function static_directory(f)
{	const listing = fs.readdirSync(f)
		.filter(x => x[0] !== '.')
		.map(x => path.join(f, x))
	listing.unshift('..')
	return {
		data: directories_template(listing),
		mimetype: 'text/html',
		status: 200,
		headers: [], }}

const stylesheet = `
body
	{ font-family: monospace;
	line-height: 1.5em;
	word-wrap: break-word; }
li + li { margin-top: 0.5em; }
`.trim()

function route(req)
{ switch (req.method)
	{	case 'GET': return static_file_or_dir(req.pathname)
		case 'POST': return user_function(req)
		default: return error_responses.method_not_allowed }}

const authorise = req => req.cookies.p === CONF.password ? true : get_file(__dirname + '/login_form.xhtml')

function directories_template(xs)
{	let tree = xs.map(x => ['li', null, [['a', [['href', x]], [last(x.split('/'))]]]])
	tree =
		['html', null, [
			['head', null, [
				['meta', [['name', 'viewport'], ['content', 'width=device-width, initial-scale=1.0']], null],
				['meta', [['charset', 'utf-8']], null],
				['style', null, [ stylesheet ]],
			]],
			['body', null, [['ul', null, tree]]],
		]]
	return '<!DOCTYPE html>' + serialise_html(tree) }

const user_function = req => read_post_data(req).then(x =>
	({	status: 200,
		mimetype: 'application/json',
		headers: [],
		data: JSON.stringify(eval(x.toString())) }))

function* walk_directory(dir)
{	for (const name of fs.readdirSync(dir))
	{	if (name[0] === '.') continue
		const pathname = path.join(dir, name)
		const stats = fs.statSync(pathname)
		if (stats.isDirectory()) yield* walk_directory(pathname)
		else if (stats.isFile()) yield pathname }}

const last = x => x[x.length-1]
