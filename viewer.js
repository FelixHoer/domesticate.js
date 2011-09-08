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
	}
	
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
var createNewContext = function(context, extension){
	var newContext = _.extend(Object.create(context), extension);
	newContext.name = context.name + ' ' + count++ + ' '; // TODO just for debug
	return newContext;
};

var createContainerContext = function(context){
	var containerContext = createNewContext(context, { container: [] });
	context.container && context.container.push(containerContext);
	return containerContext;
};

var createElementContext = function(context, element){
	var elementContext = createNewContext(context, { element: element });
	context.container && context.container.push(elementContext);
	return elementContext;
};

//--- viewer -------------------------------------------------------------------
var viewer = (function(){
	
	var elementCreator = $('<div />');
	
	var builders = {
			
		'array': function(args, context){
			var containerContext = createContainerContext(context);
			return _(args).chain().map(function(arg){
				return viewer(arg, containerContext);
			}).flatten().without(undefined).value();
		},
		
		'element': function(arg, parentContext){
			var data = _.defaults({}, arg, {tag: 'div', content: []});
			
			var element = $('<' + data.tag + '/>');
			var context = createElementContext(parentContext, element);
			
			context.stage = 'attribute';
			var attrExceptions = ['tag', 'content'];
			var resolveAttr = function(arg){
				if(typeof(arg) === 'function') return resolveAttr(arg.apply(context));
				else return arg;
			};
			var attrs = _(data).chain().filterObject(function(val, key){
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
			if(_.isArray(content))
				content.forEach(function(child){
					element.append(child);
				});
			else
				element.append(content);

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
		
		'ignore': function(arg){
			return arg;
		}
		
	};
	
	var getType = (function(){
		// find the browser-specific type of a textnode
		var textNodeType = document.createTextNode('').constructor;
		
		return function(arg){
			if(arg === null || arg === undefined) return 'ignore';
			if(typeof(arg) === 'function') return 'function';
			if(_.isArray(arg)) return 'array';
			if(typeof(arg) === 'object'){
				if(arg instanceof textNodeType) return 'ignore';
				else if(arg instanceof $) return 'ignore';
				else if(arg.text !== undefined && arg.tag === undefined) return 'extendedHtml';
				else return 'element';
			}
			return 'html';
		};
	})();
	
	var viewer = function(arg, context){
		if(arguments.length === 0)
			throw {type: 'UnsupportedArgumentLength', args: arguments};
		context || (context = {});
		var type = getType(arg);
		var builder = builders[type];
		return builder(arg, context);
	};
	
	return viewer;
	
})();

//--- element ------------------------------------------------------------------
var element = function(tag /* [attr-obj | content-array | onBuilt-function]* */){
	if(arguments.length === 0)
		throw {type: 'UnsupportedArgumentLength', args: arguments};
		
	var attrs = [];
	var contents = [];
	var onBuilts = [];
	
	_.forEach(arguments, function(arg, index){
		if(index === 0){
			attrs.push({tag: arg});
		}else if(_.isArray(arg) || typeof(arg) === 'string' || arg instanceof $){
			contents.push(arg);
		}else if(typeof(arg) === 'function'){
			onBuilts.push(arg);
		}else if(typeof(arg) === 'object'){
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
	var tags = ['h1', 'hr', 'br', 'ul', 'li', 'div', 'span', 'input', 'form'];
	
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

//--- resolveOne ---------------------------------------------------------------
var resolveOne = function(arg){
	if(typeof(arg) === 'string'){
		if(this instanceof Backbone.Model)
			return this.get(arg);
		else
			return this[arg];
	}else if(typeof(arg) === 'function')
		return arg.apply(this);
	else
		return arg;
};

//--- resolve ------------------------------------------------------------------
var resolve = function(){
	return _.reduce(arguments, function(memo, arg){
		return resolveOne.call(memo, arg);
	}, this);
};

var stringBuilder = function(arg, context){
	if(_.isArray(arg))
		return _.map(arg, function(item){
			return stringBuilder(item, context);
		}).join('');
	if(_.isFunction(arg))
		return stringBuilder(arg.apply(context), context);
	if(arg === null || arg === undefined)
		return '';
	return arg;
};

//--- out ----------------------------------------------------------------------
var createStringBuilder = function(def){
	return function(){
		return stringBuilder(def, { value: this });
	};
};

//--- bind ----------------------------------------------------------------------
/*
	modelSelector?1 keySelector formatter?2
	keySelector: key-string
	modelSelector: [ [key-string | function | model]+ ]
	formatter: build-array | function
*/
var bind = function(){
	if(arguments.length === 0 || arguments.length > 3)
		throw {type: 'UnsupportedArgumentLength', args: arguments};
		
	var args = Array.prototype.slice.call(arguments, 0);
	(args.length === 1) && args.unshift('item');
	
	var arrayize = function(arr){
		return _.isArray(arr) === true ? arr : [arr]; 
	};
	
	var modelSelector = arrayize(args[0]);
	var keySelector = args[1];
	var formatter = args[2] ? createStringBuilder(args[2]) : args[2];
	
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
				var setupUpdate = function(el){
					getModel().bind('change:' + keySelector, function(){
						var output = getOutput();
						el.each(function(){
							this.data = output;
						});
					});
				};
				
				return {text: getOutput(), onBuilt: setupUpdate};
			},
			
			attribute: function(){
				var attributeName = context.attributeName;
				
				var changeableTags = ['input', 'textarea', 'select'];
				var tag = $(this.element).prop('tagName').toLowerCase();
				// formatter would produce wrong values
				if(_.include(changeableTags, tag) && !formatter)
					$(this.element).change(function(){
						setData($(this).val());
					});
				
				getModel().bind('change:' + keySelector, function(){
					var attrs = {};
					attrs[attributeName] = getOutput();
					context.element.attr(attrs);
				});
				
				return getOutput();
			}
			
		};

		var stage = context.stage;
		return binds[stage];
	};
};

//--- out ----------------------------------------------------------------------
var out = function(/* [key-string | function | model]* */){
	var args = Array.prototype.slice.call(arguments, 0);
	(args.length === 0) && args.push('value');
	return function(){
		return '' + resolve.apply(this, args);
	};
};

//--- forEach ------------------------------------------------------------------
var forEach = function(collectionSelector /* itemKey? def */){
	var itemKey = null;
	var def = null;
	
	if(arguments.length === 3){
		itemKey = arguments[1];
		def = arguments[2];
	}else if(arguments.length === 2){
		def = arguments[1];
	}else{
		throw {type: 'UnsupportedArgumentLength', args: arguments};
	}
	
	return [function(){
		var context = this;
		
		var items = resolve.call(context, collectionSelector);
		
		var registry = [/* { model: Backbone.Model, view: $-Element, index: # }* */];
		
		var createItem = function(item, index){
			var extension = { item: item, collection: items };
			itemKey && (extension[itemKey] = item);

			var view = viewer(def, createNewContext(context, extension));
			registry.splice(index, 0, { model: item, view: view });
			return view;
		};
		
		var findEntry = function(item){
			var entry = _.detect(registry, function(entry){
				return entry.model === item;
			});
			return { entry: entry, index: _.indexOf(registry, entry) };
		};
		
		var removeItem = function(item){
			var data = findEntry(item);
			registry = _.without(registry, data.entry);
			$(data.entry.view).remove();
		};
		
		var insertView = function(view, index){
			if(index === 0){
				var entry = registry[index+1];
				$(entry.view).before(view);
			}else{
				var entry = registry[index-1];
				$(entry.view).after(view);
			}
		};
		
		items.bind('add', function(item){
			var index = items.indexOf(item);
			var view = createItem(item, index);
			
			if(items.length === 1) 
				$(context.element).append(view);
			else 
				insertView(view, index);
		});

		// register change listeners for all items
		// if after a change their position is different
		// detatch element and insert it at new position in DOM
		// remember old index and compare it with current index after change
		items.bind('change', function(item){
			var data = findEntry(item);
			var oldIndex = data.index;
			var newIndex = items.indexOf(item);
			
			if(newIndex === oldIndex)
				return;
			
			registry.splice(oldIndex, 1); // remove from old index
			registry.splice(newIndex, 0, data.entry); // insert at new index

			var view = $(data.entry.view).detach();
			insertView(view, newIndex);
		});
		
		items.bind('remove', function(item){
			removeItem(item);
		});

		return items.map(createItem);
	}];
};

var getParentElement = function(context){
	return Object.getPrototypeOf(context).element;
};

// TODO untested
// TODO just append, no ordering
var request = function(settings){
	return [function(){
		var parent = this.element;

		var onSuccess = function(response){
			parent.append(response);
		};
		
		var data = _.clone(settings);
		data.success = _.flatten([onSuccess, settings.success]);
		
		$.ajax(data);
	}];
};

// TODO untested
// TODO just append, no ordering
var requestJSON = function(settings /* key? def */){
	var key = arguments.length === 3 ? arguments[1] : undefined;
	var def = arguments.length === 3 ? arguments[2] : arguments[1];
	
	return [function(){
		var context = this;

		var onSuccess = function(response){
			var extension = { response: response };
			key && (extension[key] = response);
			
			var newContext = createNewContext(context, extension);
			var view = viewer(def, newContext);
			$(context.element).append(view);
		};
		
		var data = _.clone(settings);
		data.success = _.flatten([onSuccess, settings.success]);
		data.dataType = 'json';
		
		$.ajax(data);
	}];
};

