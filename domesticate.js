var domesticate = (function(){
  
  //### uitl ###################################################################
  
  //- toJQuery -----------------------------------------------------------------
  var toJQuery = function(valueOrArray){
    return _([valueOrArray]).chain()
      .flatten()
      .without(undefined)
      .reduce(function(memo, item){
        return memo.add(item);
      }, $()).value();
  };

  //- extend underscore --------------------------------------------------------
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
    
    isTextNode: function(arg){
      return arg.nodeType === 3;
    },
    
    isContext: function(arg){
      return arg instanceof Context;
    },
    
    toJQuery: toJQuery
    
  });
  
  //- createStringBuilder ------------------------------------------------------
  var createStringBuilder = function(def){
    return function(){
      return buildString(def, new Context({ value: this }));
    };
  };
  
  //- arrayize -----------------------------------------------------------------
  var arrayize = function(arr){
    return _.isArray(arr) ? arr : [arr]; 
  };

	//### Context ################################################################
	
	var Context = function(obj){
    this.set({ children: [] });
		this.set(obj);
	};
	
	_.extend(Context.prototype, Backbone.Events, {
		
		//- Context.set ------------------------------------------------------------
		set: function(obj){
			_.extend(this, obj);
		},

		//- Context.get ------------------------------------------------------------
		get: function(key){
			if(this[key])
				return this[key];
			if(this.parent)
				return this.parent.get(key);
			else
				return undefined;
		},

		//- Context.resolve --------------------------------------------------------
		resolve: function(){
      return _.reduce(arguments, function(context, arg){
        if(_.isString(arg))
          return _.isFunction(context.get) ? context.get(arg) : context[arg];
        if(_.isFunction(arg))
          return arg.apply(context);
        else
          return arg;
      }, this);
		},

		//- Context.append ---------------------------------------------------------
		append: function(def, context){
			return this.insert(def, undefined, context);
		},

		//- Context.insert ---------------------------------------------------------
		insert: function(def, index, context){
			var newContext = this.insertContext(index, context);
			
			var element = newContext.buildElement(def);
			if(element !== undefined && element !== null){
			  newContext.element = element;
			  this._insertChildElements(newContext, index);
			}
			
			return newContext;
		},

    //- Context.appendContext --------------------------------------------------
		appendContext: function(context){
		  return this.insertContext(undefined, context);
		},

    //- Context.insertContext --------------------------------------------------
		insertContext: function(index, context){
		  (index !== undefined) || (index = this.children.length);
      context || (context = {});

      var newContext = new Context(_.extend({ parent: this }, context));
      this.children.splice(index, 0, newContext);
      
      return newContext;
		},

		//- Context.buildElement ---------------------------------------------------
		buildElement: function(def){
			return buildElement(def, this);
		},

		//--------------------------------------------------------------------------
		_insertChildElements: function(child, index){
			var related = this._findRelatedElement(index);
			related && $(related.element.last())[related.func](child.element);
		},

		//--------------------------------------------------------------------------
		_findRelatedElement: function(ref){
			var index = _.isNumber(ref) ? ref : _.indexOf(this.children, ref);
			
			var lastElement = this._findLastChildElement(index);
			if(lastElement)
				return { func: 'after', element: lastElement };
			
			if(this.element)
				return { func: 'prepend', element: this.element };
				
			if(!this.parent)
				return undefined;
			
			return this.parent._findRelatedElement(this);
		},

		//--------------------------------------------------------------------------
		_findLastChildElement: function(index){
			(index !== undefined) || (index = this.children.length);
			
			for(var i = index-1; i >= 0; i--){
				var child = this.children[i];
				if(child.element)
					return child.element;
				var lastElement = child._findLastChildElement();
				if(lastElement)
					return lastElement;
			}
			
			return undefined;
		},

		//- Context.findElements ---------------------------------------------------
		findElements: function(){
		  if(this.element)
        return this.element;
      if(this.children)
        return _(this.children).chain()
          .invoke('findElements')
          .flatten()
          .without(undefined)
          .toJQuery().value();
      return undefined;
		},

    //- Context.findParentElement ----------------------------------------------
		findParentElement: function(){
		  if(!this.parent)
		    return undefined;
		  else
		    return this.parent.element || this.parent.findParentElement();
		},

		//- Context.moveChild ------------------------------------------------------
		moveChild: function(oldIndex, newIndex){
			var child = this.children[oldIndex];
			
			this.children.splice(oldIndex, 1);
			child.findElements().detach();

			this.children.splice(newIndex, 0, child);
			this._insertChildElements(child, newIndex);
		},

		//- Context.remove ---------------------------------------------------------
		remove: function(){
			this.trigger('remove');
			this.unbind();
			
			this.element && this.element.remove();
			delete this.element;
			
			_.invoke(this.children, 'remove');
			delete this.children;
			
			if(this.parent && this.parent.children)
				this.parent.children = _.without(this.parent.children, this);
			delete this.parent;
		},

    //- Context.setupBinding ---------------------------------------------------
		setupBinding: function(model, key, callback){
      model.bind(key, callback);
      this.bind('remove', function(){
        model.unbind(key, callback);
      });
    }
		
	});
	
	//### builder ################################################################
	
	//- buildElement -------------------------------------------------------------
	var buildElement = (function(){
		
		var elementCreator = $('<div />');
		var attrExceptions = ['tag', 'content', 'onBuilt'];
		
		var appendChildElement = function(context, element){
		  var parentElement = context.findParentElement();
      parentElement && parentElement.append(element);
		};
		
		var builders = {
				
			'array': function(args, parentContext){
			  var context = parentContext.appendContext();
				
				return _(args).chain()
					.map(function(arg){
						return buildElement(arg, context);
					})
					.flatten()
					.without(undefined).value();
			},
			
			'element': function(arg, parentContext){
				var data = _.defaults({}, arg, {tag: 'div', content: []});
				
				var element = $('<' + data.tag + ' />');
        var context = parentContext.appendContext({ element: element });
				
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
				
        appendChildElement(context, element);
	
				context.stage = 'onBuilt';
				data.onBuilt && data.onBuilt.call(context, element);
				
				context.stage = 'content';
				buildElement(data.content, context);
	
				context.stage = 'done';
				return element;
			},
			
			'extendedHtml': function(arg, context){
				var element = builders.html(arg.text, context);
				
				var childContext = _.last(context.children);
				arg.onBuilt && arg.onBuilt.call(childContext, element);
				
				return element;
			},
			
			'html': function(arg, parentContext){
				var element = elementCreator.html(arg).contents().detach();
        var context = parentContext.appendContext({ element: element });
        appendChildElement(context, element);
				return element;
			},
			
			'function': function(func, context){
				return buildElement(func.apply(context), context);
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
		
		var buildElement = function(arg, context){
			if(arguments.length === 0)
				throw {type: 'UnsupportedArgumentLength', args: arguments};
				
			if(!context || !_.isContext(context))
				context = new Context(context);
			
			var type = getType(arg);
			var builder = builders[type];
			return builder(arg, context);
		};
		
		return _.compose(toJQuery, buildElement);
		
	})();

	//- buildString --------------------------------------------------------------
	var buildString = function(arg, context){
		if(arg === null || arg === undefined)
			return '';
		if(_.isArray(arg))
			return _.map(arg, function(item){
				return buildString(item, context);
			}).join('');
		if(_.isFunction(arg))
			return buildString(arg.apply(context), context);
		return arg;
	};
	
	//### HTML ###################################################################
	
	//- createElement ------------------------------------------------------------
	var createElement = function(tag /* [attr-obj | content-array | onBuilt]* */){
		if(arguments.length === 0)
			throw { type: 'UnsupportedArgumentLength', args: arguments };
			
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
		
		return _.extend(mergedAttrs, {
			content: mergedContents, 
			onBuilt: mergedOnBuilt
		});
	};
	
	//- html ---------------------------------------------------------------------
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
		
		return _.reduce(tags, function(memo, tag){
			memo[tag] = _.bind(createElement, undefined, tag);
			return memo;
		}, {});
	})();
	
	//### templating logic #######################################################
	
	//- bind ---------------------------------------------------------------------
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
        return context.resolve.apply(context, modelSelector);
      };
			
			var getData = function(){
				return getModel().get(keySelector);
			};
			
			var setData = function(data){
				var obj = {};
				obj[keySelector] = data;
				getModel().set(obj);
			};
			
			var getOutput = function(){
				return formatter ? formatter.apply(getData()) : getData();
			};
			
			var binds = {
					
				content: function(){
					var setupUpdate = function(elements){
					  var updateContent = function(){
              var output = getOutput();
              elements.each(function(){
                this.data = output;
              });
            };
            
            this.setupBinding(getModel(), 'change:'+keySelector, updateContent);
					};
					
					return { text: getOutput(), onBuilt: setupUpdate };
				},
				
				attribute: function(){
					var attributeName = context.get('attributeName');
					
					// change model on user input
					var changeableTags = ['input', 'textarea', 'select'];
					var tag = $(this.element).prop('tagName').toLowerCase();
					// formatter would produce wrong values
					if(_.include(changeableTags, tag) && !formatter)
						$(this.element).change(function(){
							setData($(this).val());
						});
					
					// change view if model updates
					var updateAttribute = function(){
					  var attrs = {};
            attrs[attributeName] = getOutput();
            context.element.attr(attrs);
					};
					
					var key = 'change:' + keySelector;
					context.setupBinding(getModel(), key, updateAttribute);
					
					return getOutput();
				}
				
			};
	
			return binds[context.get('stage')];
		};
	};
	
	//- out ----------------------------------------------------------------------
	var out = function(/* [key-string | function | model]* */){
		var args = _.toArray(arguments);
		(args.length === 0) && (args = ['value']);
		return function(){
			return '' + this.resolve.apply(this, args);
		};
	};
	
	//- forEach ------------------------------------------------------------------
	var forEach = function(collectionSelector /* itemKey? def */){
		var itemKey = (arguments.length === 3 ? arguments[1] : undefined);
		var def = 		(arguments.length === 3 ? arguments[2] : arguments[1]);
		
		return [function(){
			var context = this;
			
			var items = context.resolve(collectionSelector);
			var registry = [];
			
			var insertItem = function(item){
				var index = items.indexOf(item);
				registry.splice(index, 0, item);
				var extension = { item: item, collection: items, parent: context };
				itemKey && (extension[itemKey] = item);
				context.insert(def, index, extension);
			};
			
			var removeItem = function(item){
				var index = _.indexOf(registry, item);
				registry.splice(index, 1);
				context.children[index].remove();
			};

			var updatePosition = function(item){
				var oldIndex = _.indexOf(registry, item);
				var newIndex = items.indexOf(item);
				
				if(newIndex === oldIndex) 
					return;
				
				registry.splice(oldIndex, 1);
				registry.splice(newIndex, 0, item);
	
				context.moveChild(oldIndex, newIndex);
			};

      context.setupBinding(items, 'add', insertItem);
      context.setupBinding(items, 'remove', removeItem);
      context.setupBinding(items, 'change', updatePosition);
			
      items.forEach(insertItem);
		}];
	};

	//- request ------------------------------------------------------------------
	var request = function(settings){
		_.isString(settings) && (settings = { url: settings });
		
		return [function(){
			var context = this;
	
			var onSuccess = function(response){
				_.defer(function(){
					var content = _.isString(response) ? response : $(response).contents();
					context.insert(content);
				});
			};
			
			var data = _.clone(settings);
			data.success = _.flatten([onSuccess, settings.success]);
			$.ajax(data);
		}];
	};

	//- requestJson --------------------------------------------------------------
	var requestJson = function(settings /* key? def */){
		_.isString(settings) && (settings = { url: settings });
		var key = arguments.length === 3 ? arguments[1] : undefined;
		var def = arguments.length === 3 ? arguments[2] : arguments[1];
		
		return [function(){
			var context = this;
	
			var onSuccess = function(response){
				_.defer(function(){
					var extension = { response: response, parent: context };
					key && (extension[key] = response);
					
					context.append(def, extension);
				});
			};
			
			var data = _.clone(settings);
			data.success = _.flatten([onSuccess, settings.success]);
			data.dataType = 'json';
			$.ajax(data);
		}];
	};

	//### library outline ########################################################

	var globalFunction = function(def, extension){
	  var context = new Context(extension);
	  context.append(def);
		return context;
	};
	
	return _.extend(globalFunction, {
		
		buildElement: buildElement,
		buildString: buildString,
		
		html: html,
		createElement: createElement,
		
		logic: {
			out: out,
			bind: bind,
			forEach: forEach,
			request: request,
			requestJson: requestJson
		}
		
	});

})();