_.mixin({
	
	mapObject: function(obj, iterator, memo){
		return _.reduce(obj, function(memo, val, key) {
			memo[key] = iterator(val, key);
			return memo;
		}, memo || {});
	},
	
	filterObject: function(obj, iterator, memo){
		return _.reduce(obj, function(memo, val, key) {
			if(iterator(val, key) === true)
				memo[key] = val;
			return memo;
		}, memo || {});
	},
	
	isObject: function(arg){
		return typeof(arg) === 'object';
	},
	
	isBackboneModel: function(arg){
		return arg instanceof Backbone.Model;
	},
	
	isJQuery: function(arg){
		return arg instanceof $;
	},
	
	isTextNode: (function(){
		// find the browser-specific type of a textnode
		var textNodeType = document.createTextNode('').constructor;
		
		return function(arg){
			return arg instanceof textNodeType;
		};
	})()
	
});

//--- Object.create ------------------------------------------------------------
// from: https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects
// /Object/create
if(!Object.create) {
  Object.create = function(o){
    function F() {}
    F.prototype = o;
    return new F();
  };
}

//--- Object.getPrototypeOf ----------------------------------------------------
// from: http://ejohn.org/blog/objectgetprototypeof/
if(typeof Object.getPrototypeOf !== "function"){
  if(typeof "test".__proto__ === "object"){
    Object.getPrototypeOf = function(object){
      return object.__proto__;
    };
  }else{
    Object.getPrototypeOf = function(object){
      // May break if the constructor has been tampered with
      return object.constructor.prototype;
    };
  }
}

//--- createNewContext ---------------------------------------------------------
var count = 0; // TODO just for debug
var createNewContext = function(context){
	var ext = _.toArray(arguments).slice(1);
	ext.unshift(Object.create(context));
	var newContext = _.extend.apply(this, ext);
	newContext.name = context.name + ' ' + count++ + ' '; // TODO just for debug
	return newContext;
};

var createContainerContext = function(context){
	var ext = _.toArray(arguments).slice(1);
	ext.unshift(context, { container: [] });
	var containerContext = createNewContext.apply(this, ext);
	context.container && context.container.push(containerContext);
	return containerContext;
};

var createElementContext = function(context, element){
	var ext = _.toArray(arguments).slice(2);
	ext.unshift(context, { element: element });
	var elementContext = createNewContext.apply(this, ext);
	context.container && context.container.push(elementContext);
	return elementContext;
};

//--- viewer -------------------------------------------------------------------
var viewer = (function(){
	
	var elementCreator = $('<div />');
	var attrExceptions = ['tag', 'content'];
	
	var builders = {
			
		'array': function(args, context){
			var containerContext = createContainerContext(context);
			return _(args).chain()
				.map(function(arg){
					return viewer(arg, containerContext);
				})
				.flatten()
				.without(undefined).value();
		},
		
		'element': function(arg, parentContext){
			var data = _.defaults({}, arg, {tag: 'div', content: []});
			
			var element = $('<' + data.tag + '/>');
			var context = createElementContext(parentContext, element);
			
			context.stage = 'attribute';
			var resolveAttr = function(arg){
				if(_.isFunction(arg)) 
					return resolveAttr(arg.apply(context));
				else 
					return arg;
			};
			var attrs = _(data).chain()
				.filterObject(function(val, key){
					return !_.include(attrExceptions, key);
				}).mapObject(function(val, key){
					context.attributeName = key;
					return resolveAttr(val);
				}).value();
			element.attr(attrs);
			context.attributeName = undefined;

			context.stage = 'onBuilt';
			data.onBuilt && data.onBuilt.call(context, element);
			
			var siblings = [];
			var extension = { siblings: siblings, container: siblings };
			var siblingContext = createNewContext(context, extension);
			
			context.stage = 'content';
			var content = viewer(data.content, siblingContext);
			var children = arrayize(content);
			_.forEach(children, function(child){
				element.append(child);
			});

			context.stage = 'done';
			return element;
		},
		
		'extendedHtml': function(arg, context){
			var element = builders.html(arg.text, context);
			
			arg.onBuilt && arg.onBuilt(element);
			
			return element;
		},
		
		'html': function(arg, context){
			var element = elementCreator.html(arg).contents().detach();
			createElementContext(context, element);
			return element;
		},
		
		'function': function(func, context){
			return viewer(func.apply(context), context);
		},
		
		'ignore': _.identity
		
	};
	
	var getType = function(arg){
		if(arg === null || arg === undefined) return 'ignore';
		if(_.isFunction(arg)) return 'function';
		if(_.isArray(arg)) return 'array';
		if(_.isObject(arg)){
			if(_.isTextNode(arg)) return 'ignore';
			if(_.isJQuery(arg)) return 'ignore';
			if(arg.text !== undefined && arg.tag === undefined) return 'extendedHtml';
			return 'element';
		}
		return 'html';
	};
	
	var viewer = function(arg, context){
		if(arguments.length === 0)
			throw {type: 'UnsupportedArgumentLength', args: arguments};
		context || (context = {});
		var type = getType(arg);
		var builder = builders[type];
		return builder(arg, context);
	};
	
	return function(){
		var view = viewer.apply(this, arguments);
		return toJQuery(view);
	};
	
})();

//--- element ------------------------------------------------------------------
var element = function(tag /* [attr-obj | content-array | onBuilt-function]* */){
	if(arguments.length === 0)
		throw {type: 'UnsupportedArgumentLength', args: arguments};
		
	var attrs = [];
	var contents = [];
	var onBuilts = [];
	
	_.forEach(arguments, function(arg, index){
		if(arg === undefined || arg === null){
			return;
		}else if(index === 0){
			attrs.push({tag: arg});
		}else if(_.isArray(arg) || _.isString(arg) || _.isJQuery(arg)){
			contents.push(arg);
		}else if(_.isFunction(arg)){
			onBuilts.push(arg);
		}else if(_.isObject(arg)){
			attrs.push(arg);
			arg.onBuilt && onBuilts.push(arg.onBuilt);
			arg.content && contents.push(arg.content);
		}else{
			throw {type: 'UnsupportedArgumentType', arg: arg};
		}
	});
	
	var mergedContents = contents;
	var mergedAttrs = _.extend.apply(this, [{}].concat(attrs));
	var mergedOnBuilt = function(){
		_.invoke(onBuilts, 'apply', this, arguments);
	};
	
	return _.extend(mergedAttrs, {content: mergedContents, onBuilt: mergedOnBuilt});
};

//--- html ---------------------------------------------------------------------
var html = (function() {
	var tags = [
	  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
	  'hr', 'br', 
	  'ul', 'ol', 'li', 'dl', 'dt', 'dd', 
	  'div', 'span',
	  'p', 'pre', 'blockquote', 'cite', 'code', 'em', 'strong',
	  'a', 'img', 
	  'form', 'input', 'select', 'option', 'textarea',
	  'table', 'tr', 'td', 'th'
	];
	
	var defaultFunctions = _.reduce(tags, function(memo, tag){
		memo[tag] = _.bind(element, undefined, tag);
		return memo;
	}, {});
	
	var specialFunctions = {
		button: function(value, onClick){
			var onBuilt = function(el){
				onClick && $(el).click(onClick);
			};
			return element('input', {type: 'submit', value: value}, onBuilt);
		}
	};
	
	return _.extend(defaultFunctions, specialFunctions);
})();

//--- resolve ------------------------------------------------------------------
var resolve = (function(){
	var resolveOne = function(arg){
		if(_.isString(arg))
			return _.isBackboneModel(this) ? this.get(arg) : this[arg];
		else if(_.isFunction(arg))
			return arg.apply(this);
		else
			return arg;
	};
	
	return function(){
		return _.reduce(arguments, function(memo, arg){
			return resolveOne.call(memo, arg);
		}, this);
	};
})();

var stringBuilder = function(arg, context){
	if(arg === null || arg === undefined)
		return '';
	if(_.isArray(arg))
		return _.map(arg, function(item){
			return stringBuilder(item, context);
		}).join('');
	if(_.isFunction(arg))
		return stringBuilder(arg.apply(context), context);
	return arg;
};

//--- createStringBuilder ------------------------------------------------------
var createStringBuilder = function(def){
	return function(){
		return stringBuilder(def, { value: this });
	};
};

var arrayize = function(arr){
	return _.isArray(arr) ? arr : [arr]; 
};

//--- bind ----------------------------------------------------------------------
var bind = function(/* modelSelector?1 keySelector formatter?2 */){
	/*
		keySelector: key-string
		modelSelector: [ [key-string | function | model]+ ]
		formatter: build-array | function
	*/
	if(arguments.length === 0 || arguments.length > 3)
		throw {type: 'UnsupportedArgumentLength', args: arguments};
		
	var args = _.toArray(arguments);
	(args.length === 1) && args.unshift('item');
	
	var modelSelector = arrayize(args[0]);
	var keySelector = args[1];
	var formatter = args[2] ? createStringBuilder(args[2]) : undefined;
	
	return function(){
		var context = this;
		
		var getModel = function(){
			return resolve.apply(context, modelSelector);
		};
		var getData = function(){
			return resolve.call(getModel(), keySelector);
		};
		var setData = function(data){
			var obj = {};
			obj[keySelector] = data;
			getModel().set(obj);
		};
		var getOutput = function(){
			return formatter ? formatter.apply(getData()): getData();
		};
		
		var binds = {
				
			content: function(){
				var setupUpdate = function(elements){
					getModel().bind('change:' + keySelector, function(){
						var output = getOutput();
						elements.each(function(){
							this.data = output;
						});
					});
				};
				
				return { text: getOutput(), onBuilt: setupUpdate };
			},
			
			attribute: function(){
				var attributeName = context.attributeName;
				
				// change model on user input
				var changeableTags = ['input', 'textarea', 'select'];
				var tag = $(this.element).prop('tagName').toLowerCase();
				// formatter would produce wrong values
				if(_.include(changeableTags, tag) && !formatter)
					$(this.element).change(function(){
						setData($(this).val());
					});
				
				// change view if model updates
				getModel().bind('change:' + keySelector, function(){
					var attrs = {};
					attrs[attributeName] = getOutput();
					context.element.attr(attrs);
				});
				
				return getOutput();
			}
			
		};

		return binds[context.stage];
	};
};

//--- out ----------------------------------------------------------------------
var out = function(/* [key-string | function | model]* */){
	var args = _.toArray(arguments);
	(args.length === 0) && (args = ['value']);
	return function(){
		return '' + resolve.apply(this, args);
	};
};

//--- forEach ------------------------------------------------------------------
var forEach = function(collectionSelector /* itemKey? def */){
	var itemKey = (arguments.length === 3 ? arguments[1] : undefined);
	var def = 		(arguments.length === 3 ? arguments[2] : arguments[1]);
	
	return [function(){
		var context = this;
		
		var items = resolve.call(context, collectionSelector);
		var registry = items.map(_.identity); // clone
		
		var createCollectionContext = function(item){
			var extension = { item: item, collection: items };
			itemKey && (extension[itemKey] = item);
			return createNewContext(context, extension);
		};
		
		items.bind('add', function(item){
			var index = items.indexOf(item);
			registry.splice(index, 0, item);
			var collectionContext = createCollectionContext(item);
			buildAndInsert(def, collectionContext, index);
		});

		// register change listeners for all items
		// if after a change their position is different
		// detatch element and insert it at new position in DOM
		// remember old index and compare it with current index after change
		items.bind('change', function(item){
			var oldIndex = _.indexOf(registry, item);
			var newIndex = items.indexOf(item);
			
			if(newIndex === oldIndex) return;
			
			registry.splice(oldIndex, 1);
			registry.splice(newIndex, 0, item);

			moveContext(context, oldIndex, newIndex);
		});
		
		items.bind('remove', function(item){
			var index = _.indexOf(registry, item);
			registry.splice(index, 1);
			removeContext(context, index);
		});

		return items.map(function(item){
			var collectionContext = createCollectionContext(item);
			return viewer(def, collectionContext);
		});
	}];
};

var getParentElement = function(context){
	return Object.getPrototypeOf(context).element;
};

var request = function(settings){
	_.isString(settings) && (settings = { url: settings });
	
	return [function(){
		var context = this;

		var onSuccess = function(response){
			buildAndInsert($(response).contents(), context);
		};
		
		var data = _.clone(settings);
		data.success = _.flatten([onSuccess, settings.success]);
		$.ajax(data);
	}];
};

var requestJson = function(settings /* key? def */){
	_.isString(settings) && (settings = { url: settings });
	var key = arguments.length === 3 ? arguments[1] : undefined;
	var def = arguments.length === 3 ? arguments[2] : arguments[1];
	
	return [function(){
		var context = this;

		var onSuccess = function(response){
			var extension = { response: response };
			key && (extension[key] = response);
			
			var newContext = createNewContext(context, extension);
			buildAndInsert(def, newContext);
		};
		
		var data = _.clone(settings);
		data.success = _.flatten([onSuccess, settings.success]);
		data.dataType = 'json';
		$.ajax(data);
	}];
};

var toJQuery = function(valueOrArray){
	return _([valueOrArray]).chain()
		.flatten()
		.without(undefined)
		.reduce(function(memo, item){
			return memo.add(item);
		}, $()).value();
};

var findPrevContextElement = function(context){
	var parent = findContainerContext(context);
	if(!parent)
		return undefined;
	
	var index = _.indexOf(parent.container, context);
	if(parent.container.length === 1 || index === 0)
		return findPrevContextElement(parent);
	
	for(var i = index-1; i >= 0; i--){
		var prev = parent.container[i];
		var el = findLastElement(prev);
		if(el)
			return el;
	}
	
	return findPrevContextElement(parent);
};

var findContainerContext = function(context){
	var proto = Object.getPrototypeOf(context);
	if(!proto || proto.hasOwnProperty('element'))
		return undefined;
	if(proto.hasOwnProperty('container'))
		return proto;
	return findContainerContext(proto);
};

var findLastElement = function(context){
	if(!context)
		return undefined;
	if(context.hasOwnProperty('element'))
		return context.element;
	if(context.hasOwnProperty('container') && _.isArray(context.container))
		for(var i = context.container.length-1; i >= 0; i--){
			var childContext = context.container[i];
			var el = findLastElement(childContext);
			if(el) 
				return el;
		}
	return undefined;
};

var findAllElements = (function(){
	var findAllArray = function(context){
		if(!context)
			return undefined;
		if(context.hasOwnProperty('element'))
			return context.element;
		if(context.hasOwnProperty('container') && _.isArray(context.container))
			return _(context.container).chain()
				.map(findAllElements)
				.flatten()
				.without(undefined).value();
		return undefined;
	};
	
	return function(context){
		return toJQuery(findAllArray(context));
	};
})();

var moveContext = function(containerContext, oldIndex, newIndex){
	var context = removeContext(containerContext, oldIndex, 'detach');
	addContext(containerContext, context, newIndex);
};

var removeContext = function(containerContext, index, elementFunction){
	elementFunction || (elementFunction = 'remove');
	var container = containerContext.container;
	var context = container[index];
	
	container.splice(index, 1);
	
	var elements = findAllElements(context);
	elements[elementFunction]();
	
	return context;
};

var addContext = function(containerContext, context, index){
	var container = containerContext.container;
	
	container.splice(index, 0, context);
	
	var elements = findAllElements(context).detach();
	insertElement(elements, containerContext, index);
};

var buildAndInsert = function(def, context, index){
	(index !== undefined) || (index = context.container.length);
	
	// execute view with intercepted context
	var newContext = createNewContext(context, { container: [] });
	var view = viewer(def, newContext);

	// insert newContext at right place
	context.container.splice(index, 0, newContext);
	
	insertElement(view, context, index);
};

var insertElement = function(view, containerContext, index){
	var container = containerContext.container;
	(index !== undefined) || (index = container.length);
	
	// find previous element if available
	var previousElement = undefined;
	if(container)
		for(var i = index-1; !previousElement && i >= 0; i--)
			previousElement = findLastElement(container[i]);
	if(!previousElement)
		previousElement = findPrevContextElement(containerContext);
	
	// insert after previous element or append to parent
	if(previousElement)
		$(previousElement).after(view);
	else
		$(getParentElement(containerContext)).prepend(view);
};

