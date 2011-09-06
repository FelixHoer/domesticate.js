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
	
	// TODO unused?
	detectLast: function(list, iterator, context){
		return _.reduce(list, function(memo, item){
			return (iterator.call(this, item) === true ? item : memo);
		}, null, context || this);
	}
	
});

//--- Object.create ------------------------------------------------------------
// from: https://developer.mozilla.org/en/JavaScript/Reference/
// Global_Objects/Object/create
if (!Object.create) {
  Object.create = function (o) {
    function F() {}
    F.prototype = o;
    return new F();
  };
}

//--- createNewContext ---------------------------------------------------------
var createNewContext = function(context, extension){
	return _.extend(Object.create(context), extension);
};

//--- viewer -------------------------------------------------------------------
var viewer = (function(){
	
	var builders = {
			
		array: function(args, context){
			return _(args).chain().map(function(arg){
				return viewer(arg, context);
			}).flatten().value();
		},
		
		element: function(arg, context){
			var data = _.defaults({}, arg, {tag: 'div', content: []});
			
			var element = $('<' + data.tag + '/>');
			context = createNewContext(context);
			context.element = element;
			
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
			
			var childContext = createNewContext(context);
			childContext.parent = element;
			
			context.stage = 'content';
			var content = viewer(data.content, childContext);
			if(_.isArray(content))
				content.forEach(function(child){
					element.append(child);
				});
			else
				element.append(content);

			context.stage = 'done';
			return element;
		},
		
		text: function(arg, context){
			var element = document.createTextNode(arg.text);
			
			arg.onBuilt && arg.onBuilt(element);
			
			return element;
		},
		
		'function': function(func, context){
			return viewer(func.apply(context), context);
		},
		
		ignore: function(arg){
			return arg;
		}
		
	};
	
	var getType = (function(){
		// find the browser-specific type of a textnode
		var textNodeType = document.createTextNode('').constructor;
		
		return function(arg){
			if(typeof(arg) === 'function') return 'function';
			if(_.isArray(arg)) return 'array';
			if(typeof(arg) === 'object'){
				if(arg instanceof textNodeType) return 'ignore';
				else if(arg instanceof $) return 'ignore';
				else if(arg.text !== undefined && arg.tag === undefined) return 'text';
				else return 'element';
			}
			return 'ignore';
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
	
	var mergedContents = _.flatten(contents);
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

//--- out ----------------------------------------------------------------------
var buildFormatter = function(def){
	return function(){
		return viewer(def, this).join('');
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
	var formatter = (_.isArray(args[2]) ? buildFormatter(args[2]) : args[2]);
	
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
			return !formatter ? getData() : formatter.apply(getData());
		};
		
		var binds = {
				
			content: function(){
				var setupUpdate = function(el){
					getModel().bind('change:' + keySelector, function(){
						el.data = getOutput();
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
var out = function(/* [key-string | function | model]+ */){
	var args = Array.prototype.slice.call(arguments, 0);
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
		
		var registry = [/* { model: Backbone.Model, view: $-Element }* */];
		
		var createItem = function(item){
			var extension = { item: item, collection: items };
			itemKey && (extension[itemKey] = item);
			
			var view = viewer(def, createNewContext(context, extension));
			registry.push({ model: item, view: view });
			return view;
		};
		
		var findPair = function(item){
			return _.detect(registry, function(pair){
				return pair.model === item;
			});
		};
		
		var removeItem = function(item){
			var pair = findPair(item);
			registry = _.without(registry, pair);
			$(pair.view).remove();
		};
		
		// TODO register change listeners on all items
		// if after a change their position is different
		// detatch element and insert it after previous element
		// will result in fewest tab-problems
		// http://api.jquery.com/detach/
		// remember old index and compare it with current index after change
		
		// advanced: check for focus and request it after insertion
		
		items.bind('add', function(item){
			var view = createItem(item);
			var index = items.indexOf(item);
			
			if(items.length === 1){
				$(context.parent).append(view);
			}else if(index === 0){
				var next = items.at(index+1);
				var pair = findPair(next);
				$(pair.view).before(view);
			}else{
				var previous = items.at(index-1);
				var pair = findPair(previous);
				$(pair.view).after(view);
			}
		});
		
		items.bind('remove', function(item){
			removeItem(item);
		});

		return items.map(createItem);
	}];
};

// TODO untested
// TODO just append, no ordering
var request = function(settings){
	return [function(){
		var parent = this.parent;

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
			key && extension[key] = response;
			
			var newContext = createNewContext(context, extension);
			var view = viewer(def, newContext);
			$(context.parent).append(view);
		};
		
		var data = _.clone(settings);
		data.success = _.flatten([onSuccess, settings.success]);
		data.dataType = 'json';
		
		$.ajax(data);
	}];
};

