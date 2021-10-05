import 'package:hive/hive.dart';
import 'package:mobile_app/preferences/models/last_login.dart';

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
const keyLastLogIn = 'lastLogIn';

class HivePreferencesRepository extends PreferencesRepository {
  HivePreferencesRepository({required Box<Map<String, dynamic>> preferencesBox})
      : _box = preferencesBox;

  final Box<Map<String, dynamic>> _box;

  @override
  Future<void> clear() async {
    await _box.clear();
  }

  @override
  Future<bool> getIsFristTime() {
    final firstTime = _box.get(
          keyIsFristTime,
          defaultValue: <String, dynamic>{
            keyIsFristTime: 0,
          },
        )![keyIsFristTime] ==
        0;

    return Future.value(firstTime);
  }

  @override
  Future<LastLogIn?> getLastLogIn() {
    final json = _box.get(
      keyLastLogIn,
      defaultValue: <String, dynamic>{},
    );

    if (json == null || json.isEmpty) {
      return Future.value(null);
    }
    return Future.value(
        LastLogIn.fromJson(json[keyLastLogIn] as Map<String, dynamic>));
  }

  @override
  Future<void> setIsFristTime() async {
    await _box.put(
      keyIsFristTime,
      <String, dynamic>{
        keyIsFristTime: 1,
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
