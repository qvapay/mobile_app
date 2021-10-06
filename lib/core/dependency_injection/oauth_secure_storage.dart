import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'package:qvapay_api_client/qvapay_api_client.dart';

const _keySecureStorage = 'secure_storage';

class CustomSecureStorage extends OAuthStorage {
  final _secureStorage = const FlutterSecureStorage();

  @override
  Future<void> delete() {
    return _secureStorage.deleteAll();
  }

  @override
  Future<String?> fetch() {
    return _secureStorage.read(key: _keySecureStorage);
  }

  @override
  Future<bool> save(String token) async {
    try {
      await _secureStorage.write(key: _keySecureStorage, value: token);
      return true;
    } catch (e) {
      return false;
    }
  }
}
