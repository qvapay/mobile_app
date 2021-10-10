import 'package:hive/hive.dart';
import 'package:mobile_app/preferences/preferences.dart';

abstract class PreferencesRepository {
  /// Gets `true` if this is the frist time you have started the app,
  /// otherwise `false`.
  Future<bool> getIsFristTime();

  /// Change the app startup value to `false`.
  Future<void> setIsFristTime();

  /// Get data of the last user who logged in.
  Future<LastLogIn?> getLastLogIn();

  /// Saves the data of the last user who logged in.
  Future<void> setLastLogIn(LastLogIn lastLogIn);

  /// Delete all data saved in preferences.
  Future<void> clear();
}

const keyIsFristTime = 'isFristTime';

/// Default value to `getIsFristTime` method.
const defValIsFristTime = <String, bool>{keyIsFristTime: true};

const keyLastLogIn = 'lastLogIn';

class HivePreferencesRepository extends PreferencesRepository {
  HivePreferencesRepository({required Box<Map> preferencesBox})
      : _box = preferencesBox;

  final Box<Map> _box;

  @override
  Future<void> clear() async {
    await _box.clear();
  }

  @override
  Future<bool> getIsFristTime() async {
    if (_box.containsKey(keyIsFristTime)) {
      final value = _box.get(
        keyIsFristTime,
        defaultValue: defValIsFristTime,
      );
      if (value == null) return true;
      return value.cast<String, bool>()[keyIsFristTime] ?? true;
    }

    return true;
  }

  @override
  Future<LastLogIn?> getLastLogIn() async {
    final json = _box.get(
      keyLastLogIn,
      defaultValue: <String, dynamic>{},
    );

    if (json == null || json.isEmpty) {
      return null;
    }
    return LastLogIn.fromJson(
      json.cast<String, Map>()[keyLastLogIn]!.cast<String, dynamic>(),
    );
  }

  @override
  Future<void> setIsFristTime() async {
    await _box.put(
      keyIsFristTime,
      <String, bool>{
        keyIsFristTime: false,
      },
    );
  }

  @override
  Future<void> setLastLogIn(LastLogIn lastLogIn) {
    return _box.put(
      keyLastLogIn,
      <String, dynamic>{
        keyLastLogIn: lastLogIn.toJson(),
      },
    );
  }
}
