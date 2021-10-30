import 'package:dio/dio.dart';
import 'package:get_it/get_it.dart';
import 'package:hive/hive.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:hydrated_bloc/hydrated_bloc.dart';
import 'package:mobile_app/authentication/authentication.dart';
import 'package:mobile_app/core/dependency_injection/oauth_secure_storage.dart';
import 'package:mobile_app/features/user_data/user_data.dart';
import 'package:mobile_app/preferences/preferences.dart';
import 'package:path_provider/path_provider.dart';
import 'package:qvapay_api_client/qvapay_api_client.dart';

final getIt = GetIt.instance;

Future<void> setUp() async {
  /// Local Storage
  await Hive.initFlutter();
  final preferencesBox = await Hive.openBox<Map>('preferences');

  HydratedBloc.storage = await HydratedStorage.build(
    storageDirectory: await getApplicationDocumentsDirectory(),
  );

  getIt

    /// API
    ..registerLazySingleton<QvaPayApi>(
      () => QvaPayApiClient(Dio(), CustomSecureStorage()),
    )

    /// * Repositories
    ..registerLazySingleton<PreferencesRepository>(
      () => HivePreferencesRepository(preferencesBox: preferencesBox),
    )
    ..registerLazySingleton<IAuthenticationRepository>(
      () => AuthenticationRepository(qvaPayApi: getIt<QvaPayApi>()),
    )
    ..registerLazySingleton<IUserDataRepository>(
      () => UserDataRepository(
        qvaPayApi: getIt<QvaPayApi>(),
        preferencesRepository: getIt<PreferencesRepository>(),
      ),
    );
}
