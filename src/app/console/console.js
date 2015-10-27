angular.module('orderCloud')

    .config( ApiConsoleConfig )
    .controller('ApiConsoleCtrl', ApiConsoleController)
	.factory('LockableParams', LockableParamsService)
	.factory('ApiConsoleService', ApiConsoleService)
	.factory('ConsoleContext', ConsoleContextService)
	.directive('parameterObject', ParameterObjectDirective)
	.directive('emptyToNull', EmptyToNullDirective)
	.filter('objectParams', objectParams)
;

function objectParams() {
	return function(params) {
		var result = [];
		angular.forEach(params, function(param) {
			if (param.Type == 'object') result.push(param);
		});
		return result;
	}
}

function ApiConsoleConfig( $stateProvider, $urlMatcherFactoryProvider ) {
    $urlMatcherFactoryProvider.strictMode(false);
    $stateProvider.state('base.console', {
        'url': '/console',
        'templateUrl': 'console/templates/console.tpl.html',
        'controller': 'ApiConsoleCtrl',
        'controllerAs': 'console',
        'resolve': {
			DocsReference: function(Docs) {
				return Docs.GetAll();
			},
			AvailableInstances: function($q, Underscore, DevCenter) {
				var deferred = $q.defer();
				DevCenter.Me.GetAccess().then(function(data) {
					var results = [];
					angular.forEach(data.Items, function(instance) {
						var existingResult = Underscore.where(results, {ClientID: instance.ClientID, UserID: instance.UserID, Claims: instance.Claims})[0];
						if (existingResult) {
							var existingIndex = results.indexOf(existingResult);
							results[existingIndex].DevGroups.push({
								ID: instance.DevGroupID,
								Name: instance.DevGroupName
							});
						} else {
							instance.DevGroups = [
								{
									ID: instance.DevGroupID,
									Name: instance.DevGroupName
								}
							];
							delete instance.DevGroupID;
							delete instance.DevGroupName;
							results.push(instance);
						}
					});
					deferred.resolve(results);
				});
				return deferred.promise;
			},
			ActiveContext: function(ConsoleContext) {
				return ConsoleContext.Get();
			}
        },
        'data':{
			limitAccess: true,
			pageTitle: 'API Console'
		}
    });
};

function ApiConsoleController($scope, $filter, Underscore, DocsReference, ActiveContext, AvailableInstances, ApiConsoleService, LockableParams, ConsoleContext) {
	var vm = this;
	//Context variables
	vm.AvailableContexts = AvailableInstances;

	//TODO: this might have to change to account for claims/userid along with ClientID
	vm.ActiveContext = ActiveContext ? Underscore.where(vm.AvailableContexts, {ClientID: ActiveContext.ClientID})[0] : null;
	vm.SelectedContext = vm.ActiveContext;

	//Console variables
	vm.Sections = DocsReference.Sections;
	vm.Resources = DocsReference.Resources;
	vm.SelectedResource = null;
	vm.SelectedEndpoint = null;

	//Response variables
	vm.Responses = [];
	vm.SelectedResponse = null;

	vm.updateContext = function(context) {
		vm.SelectedContext = context;
		vm.setContext(context);
		vm.ContextMenuOpen = false;
		vm.contextSearchTerm = '';
	};

	vm.setContext = function(context) {
		ConsoleContext.Update(context)
			.then(function() {
				if (!vm.ActiveContext) {
					vm.SelectResource({resource: Underscore.where(vm.Resources, {Name: 'Buyers'})[0]});
				} else {
					LockableParams.Clear();
					vm.Responses = [];
					vm.SelectedResponse = null;
					vm.SelectedEndpoint = null;
				}
				vm.ActiveContext = context;
			});
	};

	vm.removeContext = function() {
		LockableParams.Clear();
		vm.SelectedContext = null;
		vm.ActiveContext = null;
		vm.SelectedResource = null;
		vm.Responses = [];
		vm.SelectedResponse = null;
		LockableParams.Clear();
		ConsoleContext.Remove();
	};

	vm.isLocked = function(paramName) {
		return LockableParams.IsLocked(paramName);
	};

	vm.unlockParam = function(paramName) {
		LockableParams.RemoveLock(paramName)
	};

	vm.lockParam = function(paramName, paramValue) {
		LockableParams.SetLock(paramName, paramValue)
	};

	vm.setMaxLines = function(editor) {
		editor.setOptions({
			maxLines:200
		});
	};

	vm.addNewFilter = function() {
		vm.SelectedEndpoint.Filters.push({Key: null, Value: null})
	};

	vm.removeFilter = function(filterIndex) {
		vm.SelectedEndpoint.Filters.splice(filterIndex, 1);
	};

	vm.Execute = function() {
		ApiConsoleService.ExecuteApi(vm.SelectedEndpoint);
	};

	vm.SelectResource = function(scope) {
		vm.SelectedResource = scope.resource;
	};

	if (vm.ActiveContext) {
		vm.SelectResource({resource: Underscore.where(vm.Resources, {ID: 'Buyers'})[0]});
	}

	vm.SelectEndpoint = function(scope) {
		vm.SelectedEndpoint = scope.endpoint;
	};

	$scope.$watch(function () {
		return vm.SelectedResource;
	}, function (n, o) {
		if (n && n === o) return;
		vm.SelectedEndpoint = null;
	});

	$scope.$watch(function () {
		return vm.SelectedEndpoint;
	}, function (n, o) {
		if (!n || n == '' || n === o) return;
		if (angular.isDefined(n.Parameters)) {
			ApiConsoleService.InitializeParameters(n);
		}
	});

	$scope.$on('event:responseSuccess', function(event, c) {
		if (c.config.url.indexOf('.html') > -1 || c.config.url.indexOf('/docs') > -1 || c.config.url.indexOf('devcenter/') > -1 || c.config.url.indexOf('devcenterapi') > -1) return;
		c.data = $filter('json')(c.data);
		vm.Responses.push(c);
		vm.SelectResponse(c);
	});

	$scope.$on('event:responseError', function(event, c) {
		if (c.config.url.indexOf('.html') > -1 || c.config.url.indexOf('/docs') > -1 || c.config.url.indexOf('devcenter/') > -1 || c.config.url.indexOf('devcenterapi') > -1) return;
		c.data = $filter('json')(c.data);
		vm.Responses.push(c);
		vm.SelectResponse(c);
	});

	vm.SelectResponse = function(response) {
		vm.SelectedResponse = response;
	}
}

function ApiConsoleService( $filter, $resource, apiurl, LockableParams ) {
	var service = {
		ExecuteApi: _executeApi,
		InitializeParameters: _initializeParameters
	};

	return service;

	/////
	function _executeApi(endpoint) {
		var UriTemplate = '/' + $filter('URItoAngular')(endpoint.UriTemplate);
		var HttpVerb = endpoint.HttpVerb;
		var RequestBody = endpoint.RequestBody ? endpoint.RequestBody.Value : undefined;
		var Parameters = writeParameters(endpoint);

		function writeParameters(endpoint) {
			var result = {};
			angular.forEach(endpoint.Parameters, function(p) {
				result[p.Name] = p.Value;
			});
			if (endpoint.Filters) {
				angular.forEach(endpoint.Filters, function(filter) {
					result[filter.Key] = filter.Value;
				})
			}
			return result;
		}

		return $resource(apiurl + UriTemplate, Parameters, {resourceMethod: {method: HttpVerb}}).resourceMethod(RequestBody).$promise;
	}

	function _initializeParameters(endpoint) {
		var lockableParams = LockableParams.Get();
		if (endpoint.RequestBody) {
			endpoint.RequestBody.Value = endpoint.RequestBody.Sample;
		}
		angular.forEach(endpoint.Parameters, function(param) {
			if (param.Name == 'filters') {
				endpoint.Filters = [];
			} else {
				param.Lockable = angular.isDefined(lockableParams[param.Name]);
				param.Value = param.Lockable ? lockableParams[param.Name] : null;
			}
		});
	}
}


function LockableParamsService($q) {
	var service = {
		Get: _get,
		IsLocked: _isLocked,
		SetLock: _setLock,
		RemoveLock: _removeLock,
		Clear: _clearAll
	};

	var lockableParams = {
		'buyerID':null,
		'page':null,
		'pageSize':null
	};

	return service;

	function _get() {
		return lockableParams;
	}

	function _isLocked(key) {
		return lockableParams[key] ? true : false;
	}

	function _setLock(key, value) {
		var defer = $q.defer();
		lockableParams[key] = value;
		defer.resolve();
		return defer.promise;
	}

	function _removeLock(key) {
		var defer = $q.defer();
		lockableParams[key] = null;
		defer.resolve();
		return defer.promise;
	}

	function _clearAll() {
		var defer = $q.defer();
		angular.forEach(lockableParams, function(value, key) {
			lockableParams[key] = null;
		});
		defer.resolve();
		return defer.promise;
	}
}

function ParameterObjectDirective() {
	var obj = {
		restrict: 'A',
		require: 'ngModel',
		link: function(scope, element, attrs, ctrl) {
			ctrl.$validators.parameterObject = function(modelValue, viewValue) {
				if (ctrl.$isEmpty(modelValue)) return true;
				try {
					return validateModel(viewValue);
				} catch(ex) {
					return false;
				}
				function validateModel(value) {
					var obj = JSON.parse(value.replace(/\n/g, ''));
					var fieldErrors = 0;
					angular.forEach(scope.console.SelectedEndpoint.RequestBody.Fields, function(field) {
						//TODO: make empty objects and objects that are straight up missing required fields entirely invalid
						angular.forEach(obj, function(value, key) {
							if (key == field.Name && field.Required) {
								switch (field.Type) {
									case('string'):
										if (!angular.isString(value) || !value.length) fieldErrors++;
										break;
									case('boolean'):
										if (typeof(value) != 'boolean') fieldErrors++;
										break;
									case('object'):
										if (!angular.isObject(value)) fieldErrors++;
										break;
									case('integer'):
										if (!angular.isNumber(value)) fieldErrors++;
								}
							}
						})
					});
					return fieldErrors == 0;
				}
			}
		}
	};
	return obj;
}

function ConsoleContextService($q, jwtHelper, DevCenter, Auth) {
	var service = {
		Get: _getContext,
		Update: _updateContext,
		Remove: _removeContext
	};

	function _getContext() {
		var deferred = $q.defer();
		var token = Auth.GetToken();
		if (!angular.isDefined(token)) {
			deferred.resolve('No Context');
		} else {
			var tokenPayload = jwtHelper.decodeToken(token);
			deferred.resolve({
				ClientID: tokenPayload.cid.toUpperCase(),
				User: tokenPayload.usr
			});
		}
		return deferred.promise;
	}

	function _updateContext(context) {
		var deferred = $q.defer();
		DevCenter.AccessToken(context.ClientID, context.UserID)
			.then(function(data) {
				Auth.SetToken(data['access_token']);
				deferred.resolve();
			});
		return deferred.promise;
	}

	function _removeContext() {
		Auth.RemoveToken();
	}

	return service;
}

function EmptyToNullDirective() {
	var directive = {
		restrict: 'A',
		require: 'ngModel',
		link: function (scope, elem, attrs, ctrl) {
			ctrl.$parsers.push(function(viewValue) {
				if(viewValue === "") {
					return null;
				}
				return viewValue;
			});
		}
	};

	return directive;
}