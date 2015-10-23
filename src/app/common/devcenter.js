angular.module('orderCloud')
	.factory('DevCenter', DevCenterFactory)
	.factory('DevAuth', DevAuthFactory)
;

function DevCenterFactory($resource, $state, apiurl, authurl, ocscope, devcenterClientID, DevAuth, Auth) {
	var service = {
		Register: _register,
		Login: _login,
		Logout: _logout,
		AccessToken: _getAccessToken,
		SaveGroupAccess: _saveGroupAccess,
		Users: {
			List: _usersList
		},
		Me: {
			Get: _meGet,
			//Update: _meUpdate,
			GetAccess: _meAccessGet,
			Groups:  {
				List: _meGroups,
				Get: _meGroupsGet
			}
		},
		Group: {
			Create: _groupCreate,
			Update: _groupUpdate,
			Delete: _groupDelete,
			SaveMemberAssignment: _groupSaveMemberAssignment,
			ListMemeberAssignments: _groupListMemberAssignments,
			DeleteMemberAssignment: _groupDeleteMemberAssignment,
			GetAccess: _groupAccessGet
		},
		Company: {
			Create: _createAdminCompany
			//Update: _updateAdminCompany
		}
	};

	//GENERAL
	function _register(registration) {
		return $resource(apiurl + '/v1/registration').save(registration).$promise;
	}

	function _login(credentials) {
		var data = $.param({
			grant_type: 'password',
			scope: ocscope,
			client_id: devcenterClientID,
			username: credentials.Username || credentials.Email,
			password: credentials.Password
		});
		return $resource(authurl, {}, { login: { method: 'POST'}}).login(data).$promise;
	}

	function _logout() {
		DevAuth.RemoveToken();
		Auth.RemoveToken();
		$state.go('base.home');
	}

	function _getAccessToken(clientID, userID) {
		return $resource(apiurl + '/v1/devcenter/imersonateaccesstoken', {}, {DevTokenGet: {method: 'GET', params: { 'clientID': clientID, 'userID': userID }, headers:{Authorization: DevAuth.GetToken()}}}).DevTokenGet().$promise;
	}

	function _saveGroupAccess(access, accepted, token) {
		return $resource(apiurl + '/v1/devcenter/devgroupaccess', {}, {DevGroupAccessSave: {method: 'POST', params:{'accepted': accepted}, headers:{Authorization: 'Bearer ' + token}}}).DevGroupAccessSave(access).$promise;
	}

	//USERS
	function _usersList(search, page, pageSize) {
		return $resource(apiurl + '/v1/devcenter/users', {}, {DevUserSearch: {method: 'GET', params: { 'search': search, 'page': page, 'pageSize': pageSize }, headers:{Authorization: DevAuth.GetToken()}}}).DevUserSearch().$promise;
	}

	//ME
	function _meGet() {
		return $resource(apiurl + '/v1/devcenter/me', {}, {MeGet: {method: 'GET', headers:{Authorization: DevAuth.GetToken()}}}).MeGet().$promise;
	}

	function _meGroups(page, pageSize, accepted) {
		return $resource(apiurl + '/v1/devcenter/me/devgroups', {}, {DevGroupGet: {method: 'GET', params: { 'page': page, 'pageSize': pageSize, 'accepted': accepted }, headers:{Authorization: DevAuth.GetToken()}}}).DevGroupGet().$promise;
	}

	function _meGroupsGet(groupID) {
		return $resource(apiurl + '/v1/devcenter/me/devgroups/:groupID', { 'groupID': groupID }, {DevGroupGet: {method: 'GET', headers:{Authorization: DevAuth.GetToken()}}}).DevGroupGet().$promise;
	}

	function _meAccessGet(page, pageSize, accepted) {
		return $resource(apiurl + '/v1/devcenter/me/access', {}, {DevAccessGet: {method: 'GET', params: {'page': page, 'pageSize': pageSize, 'accepted':accepted}, headers:{Authorization: DevAuth.GetToken()}}}).DevAccessGet().$promise;
	}

	//USER GROUPS
	function _groupCreate(group) {
		return $resource(apiurl + '/v1/devcenter/devgroups', {}, {DevGroupSave: {method: 'POST', params:{}, headers:{Authorization: DevAuth.GetToken()}}}).DevGroupSave(group).$promise;
	}

	function _groupUpdate(groupID, group) {
		return $resource(apiurl + '/v1/devcenter/devgroups/:groupID', { 'groupID': groupID }, { DevGroupUpdate: { method: 'PUT', headers:{Authorization: DevAuth.GetToken()}}}).DevGroupUpdate(group).$promise;
	}

	function _groupDelete(groupID) {
		return $resource(apiurl + '/v1/devcenter/devgroups/:groupID', { 'groupID': groupID }, {DevGroupDelete: {method: 'DELETE', headers:{Authorization: DevAuth.GetToken()}}}).DevGroupDelete().$promise;
	}

	function _groupSaveMemberAssignment(groupID, assignment) {
		return $resource(apiurl + '/v1/devcenter/devgroups/:groupID/memberusers', { 'groupID': groupID }, {DevGroupSave: {method: 'POST', headers:{Authorization: DevAuth.GetToken()}}}).DevGroupSave(assignment).$promise;
	}

	function _groupListMemberAssignments(groupID, page, pageSize, accepted) {
		return $resource(apiurl + '/v1/devcenter/devgroups/:groupID/memberusers', { 'groupID': groupID }, {DevGroupGetAssignments: {method: 'GET', params: { 'page': page, 'pageSize': pageSize, 'accepted': accepted }, headers:{Authorization: DevAuth.GetToken()}}}).DevGroupGetAssignments().$promise;
	}

	function _groupDeleteMemberAssignment(groupID, userID) {
		return $resource(apiurl + '/v1/devcenter/devgroups/:groupID/memberusers', { 'groupID': groupID }, {DevGroupDeleteAssignment: {method: 'DELETE', params: { 'userID': userID }, headers:{Authorization: DevAuth.GetToken()}}}).DevGroupDeleteAssignment().$promise;
	}
	
	function _groupAccessGet(groupID, page, pageSize, accepted) {
		return $resource(apiurl + '/v1/devcenter/devgroups/:groupID/access', { 'groupID': groupID }, {GroupAccessGet: {method: 'GET', params: { 'page': page, 'pageSize': pageSize, 'accepted': accepted }, headers:{Authorization: DevAuth.GetToken()}}}).GroupAccessGet().$promise;
	}

	//COMPANY
	function _createAdminCompany(registration, assignedGroupID) {
		return $resource(apiurl + '/v1/devcenter/admincompany', {}, {DevCompanySave: {method: 'POST', params: {'assignedGroupID': assignedGroupID}, headers:{Authorization: DevAuth.GetToken()}}}).DevCompanySave(registration).$promise;
	}





	return service;
}

function DevAuthFactory($cookieStore, $q) {
	var service = {
		GetToken: _get,
		SetToken: _set,
		RemoveToken: _remove,
		IsAuthenticated: _isAuthenticated
	};
	return service;

	///////////////

	function _get() {
		//TODO: setup auth token storage
		return $cookieStore.get('DevCenterToken');
	}

	function _set(token) {
		$cookieStore.put('DevCenterToken', 'Bearer ' + token);
	}

	function _remove() {
		$cookieStore.remove('DevCenterToken');
	}

	function _isAuthenticated() {
		var deferred = $q.defer();

		if ($cookieStore.get('DevCenterToken')) {
			deferred.resolve($cookieStore.get('DevCenterToken'));
		} else {
			deferred.reject();
		}
		return deferred.promise;
	}
}