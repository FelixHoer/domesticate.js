# domesticate.js

domesticate.js is a smart templating library, that keeps DOM and data in sync.

# usage

Define the basic HTML-structure and use bindings for Collections (`forEach`) 
and Models (`bind`).

```javascript
var html = domesticate.html;
var forEach = domesticate.logic.forEach;
var bind = domesticate.logic.bind;

var template = 
	html.div([
	
		'Available Items:', 
		html.ul(forEach('shopItems',
			html.li([
				bind('name'), ' costs ', bind('price'), '&euro;'
			])
		)),
		
		'Edit Items:', 
		html.form({ method: 'post', action: '#' }, [
			html.ul(forEach('shopItems',
				html.li([
					html.input({ type: 'text', value: bind('name') }),
					' costs ',
					html.input({ type: 'text', value: bind('price') }),
					'&euro;'
				])
			))
		])
	
	]);
```

Then add some Backbone Models and Collections.

```javascript
var ShopItem = Backbone.Model.extend({}); 
var ShopItemCollection = Backbone.Collection.extend({ model: ShopItem });

var items = new ShopItemCollection([
	{name: 'Computer', price: 400}, 
	{name: 'Harddisk', price: 100}, 
	{name: 'Mouse', price: 10}
]);
```

And finally link them together by building the template.

```javascript
var context = domesticate(template, { shopItems: items });
$('body').append(context.findElements());
```

Done. If the models are modified, the DOM-Elements will automatically reflect 
those changes. And it is likewise with adding/removing items to the collection.
No more manual update code!

Other examples are available in the `example` folder.
`array.html` is an extended version of the above example with ordering, add and 
remove.

# api

## building

### domesticate( def, [context] )

Creates a `Context` from the given `context`-object and builds the `def` with 
`buildElement` in the `Context`.
It returns the `Context`.

### domesticate.buildElement( def, [context] )

Recursively builds a DOM fragment of `def` depending on it's type:

`element`: given an object like shown below it builds a DOM Element

```javascript
{ 
	tag: String (default = 'div')
	content: everything buildElement accepts
	onBuild: Function
	<other-attributes>: String || Function
}
```

`array`: call `buildElement` on all items

`function`: calls the function with `this` set to the given `context` and 
processes it's output again with `buildElement`

`text`: given an object like shown below it builds a TextNode

```javascript
{ 
	text: String
	onBuild: Function
}
```

`other`: everything that doesn't match any of the other rules is parsed with 
jQuery

All operations are performed in the created `Context` and `buildElement` also 
spawns new child-`Context`s.

It returns a jQuery-Object with the DOM-fragment.

### domesticate.buildString( def, [context] )

Recursively builds a String depending on `def`'s type:

`array`: calls `buildString` on all items and concatenates them to one string

`function`: calls the given function with `this` set to `context` and processes 
it's output again with `buildString`

otherwise 'def' is simply returned.

## element generation

### domesticate.createElement( tag, [attr-obj | content-array | onBuilt]* )

`createElement` is a convenience function to create `buildElement`'s `element` 
objects. 

It's first argument `tag` will be the tag-name of the `element`.

All given functions will be called when the `element`'s `onBuilt` is called.
Arrays are merged to one big array, which can be found under `content`.
Objects are merged to one to provide the attributes of the HTML Element.

### domesticate.html

is an convenience object that holds versions of `createElement` with the `tag`
argument already filled in. ie:

```javascript
html.p({ 'class': 'some-text' }, ['first child', 'second child']);
-> { tag: 'p', 'class': 'some-text', content: ['first child', 'second child'] }
```

## templating logic

### domesticate.logic.bind( [modelSelector]1 keySelector [formatter]2 )

binds the value of an attribute or DOM-Element to the key of a Model.
If the data changes the attribute or element will be updated.

For `input`, `textarea` and `select` elements it also works the other way 
around. As soon as the user inputs a new value these changes are reflected in 
the data.

`modelSelector` is per default 'item' but can be anything that `resolve` 
accepts. It's value will be `resolve`d the find the model from the context.

`keySelector` has to be a String to select the attribute of the model.

`formatter` if provided can be anything that `buildString` would accept.

`bind` returns a function that has to be (automatically) run in the right 
context.

### domesticate.logic.out( [key-string | function | model]* )

returns a function that will `resolve` the arguments in the then provided 
context.

### domesticate.logic.forEach( collectionSelector, [itemKey], def )

builds `def` for all items of it's collection, adds and removes `def`-builds 
according to the changes of the collection and keeps them in order.

`collectionSelector` can be anything `resolve` accepts. `resolve`d in the 
context it sould return the collection.

`itemKey` should be a String by which the item (each) can be accessed in the 
child-contexts. By default the item is each time available under 'item'.

`def` is a fragment-definition that `buildElement` would accept. It will be 
built for each item of the collection and items that are added.

The correct order will be ensured each time an item is added or when an item is 
changed and thereby moves to another place.

`forEach` returns an array of one function that will do all that when called in 
the right context.

### domesticate.logic.request( settings-object || url-string )

requests an external resource and inserts it at the defined position.

The only argument is either an object that `jQuery.ajax` would like or a string 
containing the url.

`request` returns an array of one function that has to be called in the right 
context.

### domesticate.logic.requestJson( settings, [key], def )

requests an external JSON resource and builds it's `def` with the response data 
available in the context.

`settings` can either be an object that `jQuery.ajax` would accept or a string 
containing the url.

`key` should be a String by which the response data can be accessed in the 
child-context.

`def` is a fragment-definition that `buildElement` would accept. It will be 
built after the response is received with an extended context.

`requestJson` returns an array of one function that has to be called in the 
right context.

## context

The `Context`-hierarchy makes it possible to **share data** between different 
levels of the hierarchy and provides an additional layer over the DOM for 
**finer-grained control to position DOM-Elements**.

```javascript
{
	parent: Context
	children: Context[]
	element: jQuery-Object
	stage: String ('attribute', 'onBuilt', 'content', 'done')
	attributeName: String
}
```

Each `Context` has a `parent` (except for the root context) and several 
`children` and thereby builds a tree.

If the `Context` renders a DOM-Element, it also has a `element`-property. 
For such `stage` and `attributeName` will be set during the build-process.

### Context.set( obj )

Copies all properties from `obj` the the context.

### Context.get( key )

Returns the with `key` identified property or looks it up in the parent and 
so forth.

### Context.resolve( arguments* )

recursively resolves each argument according to the rules below to find the 
desired value.

resolution of one argument by it's type:

`string`: return value of property of the context

`function`: call function with this set to current context

otherwise: returns argument

### Context.append( def, [context] )

`insert` at the last position.

### Context.insert( def, index, [context] )

Creates a new `Context` from `context`, inserts it in it`s children according to
`index` and builds (`buildElement`) `def` in it.
The built element is correctly inserted in the DOM in relation to it's siblings.
Returns the created `Context`.

### Context.appendContext( [context] )

`insertContext` at the last position.

### Context.insertContext( index, [context] )

Creates a new `Context` from `context` and inserts it in it`s children according
to `index`.
Returns the `Context`.

### Context.buildElement( def )

Builds the `def` in the current `Context`. (see `buildElement`)

### Context.findElements()

Recursively finds the highest elements of this `Context` and it's `children`, 
and returns them as jQuery-Object.

### Context.findParentElement()

Recursively finds the next higher element (of a `parent`).

### Context.moveChild( oldIndex, newIndex )

Moves a `Context` in `children` from it's old index to a new position and 
updates the DOM accordingly.

### Context.remove()

Removes the `Context` from the `Context`-hierarchy, deletes the linked 
DOM-elements and fires a `remove` event to unbind bindings etc.

### Context.setupBinding( model, key, callback )

Binds `callback` to `model` to be called whenever it fires a `key` event and
also registers to be cleaned up once the `Context` is `remove`d.

# dependencies

* [Backbone.js](http://documentcloud.github.com/backbone/)
* [Underscore.js](http://documentcloud.github.com/underscore/)
* [jQuery](http://jquery.com/)

# tested

* Google Chrome 12.0.742.112
* Mozilla Firefox 3.6.22
* Microsoft IE 7

# license

domesticate.js is MIT licensed.
