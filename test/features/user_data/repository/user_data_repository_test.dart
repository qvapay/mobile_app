import 'dart:convert';

import 'package:dartz/dartz.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/error/failures.dart';
import 'package:mobile_app/features/preferences/preferences.dart';
import 'package:mobile_app/features/user_data/user_data.dart';
import 'package:mocktail/mocktail.dart';
import 'package:qvapay_api_client/qvapay_api_client.dart';

import '../../../fixtures/fixture_adapter.dart';

class MockQvaPayApi extends Mock implements QvaPayApi {}

class MockPreferencesRepository extends Mock implements PreferencesRepository {}

void main() {
  late QvaPayApi api;
  late PreferencesRepository preferencesRepository;
  late UserDataRepository userDataRepository;

  setUp(() {
    api = MockQvaPayApi();
    preferencesRepository = MockPreferencesRepository();
    userDataRepository = UserDataRepository(
      qvaPayApi: api,
      preferencesRepository: preferencesRepository,
    );
  });

  final tMeJson = json.decode(fixture('me.json')) as Map<String, dynamic>;
  final tMeModel = Me.fromJson(tMeJson);

  final tUserDataModel = UserData.fromMe(tMeModel);
  final tSaveDateLastLogIn = DateTime.parse('2021-08-05T00:31:02.000000Z');

  final tLastLoginModel = LastLogIn(
      name: tUserDataModel.name,
      email: tUserDataModel.email,
      photoUrl: tUserDataModel.logo,
      date: tSaveDateLastLogIn);
  group('UserDataRepository', () {
    test('should return Right(UserData)', () async {
      when(() => preferencesRepository.getIsFristTime())
          .thenAnswer((_) async => true);
      when(() => preferencesRepository.setIsFristTime())
          .thenAnswer((_) => Future.value());
      when(() => api.getUserData()).thenAnswer((_) async => tMeModel);
      when(() => preferencesRepository.setLastLogIn(tLastLoginModel))
          .thenAnswer((_) => Future.value());

      final data = await userDataRepository.getUserData(
        saveDateLastLogIn: tSaveDateLastLogIn,
      );

      expect(data, Right<Failure, UserData>(tUserDataModel));
      verify(() => preferencesRepository.setIsFristTime()).called(1);
      verify(() => preferencesRepository.setLastLogIn(tLastLoginModel))
          .called(1);
    });

    test(
        'should return [Left<AuthenticationFailure>] when '
        'the session time has expired', () async {
      when(() => preferencesRepository.getIsFristTime())
          .thenAnswer((_) async => false);
      when(() => api.getUserData()).thenThrow(UnauthorizedException());
      when(() => preferencesRepository.setLastLogIn(tLastLoginModel))
          .thenAnswer((_) => Future.value());

      expect(
        await userDataRepository.getUserData(
          saveDateLastLogIn: tSaveDateLastLogIn,
        ),
        const Left<Failure, UserData>(AuthenticationFailure()),
      );
      verify(() => preferencesRepository.getIsFristTime()).called(1);
      verifyNoMoreInteractions(preferencesRepository);
    });
    test(
        'should return [Left<ServerFailure>] when '
        'the session time has expired', () async {
      when(() => preferencesRepository.getIsFristTime())
          .thenAnswer((_) async => false);
      when(() => api.getUserData()).thenThrow(ServerException());
      when(() => preferencesRepository.setLastLogIn(tLastLoginModel))
          .thenAnswer((_) => Future.value());

      expect(
        await userDataRepository.getUserData(
          saveDateLastLogIn: tSaveDateLastLogIn,
        ),
        const Left<Failure, UserData>(ServerFailure()),
      );
      verify(() => preferencesRepository.getIsFristTime()).called(1);
      verifyNoMoreInteractions(preferencesRepository);
    });
  });
}
