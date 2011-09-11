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
$('body').append(domesticate(template, { shopItems: items }));
```

Done. No more manual update code!

Other examples are available in the `example` folder.
`array.html` is an extended version of the above example with ordering, add and 
remove.

# api

## building

### domesticate( def, [context] )
### domesticate.buildElement( def, [context] )

Recursively builds a DOM fragment (returned as jQuery-Object) of `def` 
depending on it's type:

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

`primitive`: everything that doesn't match any of the other rules is built with 
jQuery

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

## context resolving

### domesticate.resolve( arguments* )

resolves each argument with `this` set to the result of the last resolution 
starting with `this` of the first `resolve` call.

resolves one argument by it's type:

`string`: return value of property of the context

`function`: call function with this set to current context

otherwise: return argument

returns the result of the last `resolve` call.

## dynamic insertion

### domesticate.buildAndInsert( def, context, index )

calls `buildElement` with `def`, inserts it with it's `context` in the 
contextContainer at `index` and positions the built DOM-Elements in relation to 
it's sibling-contexts.

### domesticate.insertElement( view, containerContext, index )

inserts the given DOM-Elements (`view`) in relation to the elements of the 
context at `index` in `containerContext`

### domesticate.addContext( containerContext, context, index )

adds `context` to `containerContext` at `index` and moves `context`'s 
DOM-Elements in relation to the sibling contexts in `containerContext`.

### domesticate.removeContext( containerContext, index, [elementFunction] )

removes the context at `index` of `containerContext` and performs 
`elementFunction` on it's DOM-Elements. 
`elementFunction` is per default 'remove' but 'detach' can also be useful.

### domesticate.moveContext( containerContext, oldIndex, newIndex )

moves a context from `oldIndex` in `containerContext` to `newIndex` and also 
repositions it's DOM-Elements accordingly.

## context creation

### domesticate.createNewContext( context, [extension-object]* )

creates a new object with `context` as it's prototype and extended with all 
'extension-object's.

### domesticate.createContainerContext( context, [extension-object]* )

creates a new object with `context` as it's prototype, extends it with all 
`extension-object`s, sets 'container' to an empty array and registers itself at 
the parent container array.

### domesticate.createElementContext( context, element, [extension-object]* )

creates a new object with `context` as it's prototype, extends it with all 
`extension-object`s, sets 'element' to the given `element` and registers itself 
at the parent container array.

## context traversal

### domesticate.findPrevContextElement( context )

returns the nearest previous DOM-Sibling-Element according to the 
build-definition.

### domesticate.findContainerContext( context )

travels the prototype chain up until it finds a parent context with a 
'container' property and returns it.

### domesticate.findLastElement( context )

returns the last DOM-element of the `context`'s container and recursively it's 
items.

### domesticate.findAllElements( context )

returns all DOM-element of the `context`'s container and recursively it's items.

### domesticate.getParentElement( context ) 

returns the DOM-element of `context`'s prototype-parent.

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
