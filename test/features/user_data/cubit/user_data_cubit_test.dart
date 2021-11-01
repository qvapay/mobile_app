import 'dart:convert';

import 'package:bloc_test/bloc_test.dart';
import 'package:dartz/dartz.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/error/failures.dart';
import 'package:mobile_app/features/user_data/user_data.dart';
import 'package:mocktail/mocktail.dart';

import '../../../constants.dart';
import '../../../fixtures/fixture_adapter.dart';
import '../../../helpers/hydrated_bloc.dart';

class MockUserDataRepository extends Mock implements IUserDataRepository {}

void main() {
  initHydratedBloc();

  late IUserDataRepository userDataRepository;
  late UserDataCubit userDataCubit;

  setUp(() {
    userDataRepository = MockUserDataRepository();
    userDataCubit = UserDataCubit(userDataRepository: userDataRepository);
  });

  final tUserDataJson =
      json.decode(fixture('user_data.json')) as Map<String, dynamic>;
  final tUserDataModel = UserData.fromJson(tUserDataJson);
  test('initial state', () {
    expect(userDataCubit.state, UserDataStateLoading());
  });

  group('fromJson', () {
    test('shuld return [UserDataStateLoaded]', () {
      expect(
        userDataCubit.fromJson(tUserDataJson),
        equals(UserDataStateLoaded(userData: tUserDataModel)),
      );
    });

    test('should return UserDataStateError when is empty', () {
      expect(
        userDataCubit.fromJson(<String, dynamic>{}),
        equals(UserDataStateError(message: 'Empty Cache')),
      );
    });
  });

  group('toJson', () {
    test('shuld return UserData json when the state is [UserDataStateLoaded]',
        () {
      expect(
        userDataCubit.toJson(UserDataStateLoaded(userData: tUserDataModel)),
        equals(tUserDataJson),
      );
    });

    test('should return empty [Map] when is not [UserDataStateLoaded]', () {
      expect(
        userDataCubit.toJson(UserDataStateLoading()),
        equals(<String, dynamic>{}),
      );
    });
  });

  group('UserDataStateInitial ', () {
    test('supports value comparisons', () {
      expect(UserDataStateInitial(), UserDataStateInitial());
    });
  });

  group('UserDataState', () {
    blocTest<UserDataCubit, UserDataState>(
      'emit [UserDataStateLoaded] when `getUserData` is use',
      setUp: () {
        when(() => userDataRepository.getUserData(saveDateLastLogIn: tDate))
            .thenAnswer((_) async => Right(tUserDataModel));
      },
      build: () => UserDataCubit(userDataRepository: userDataRepository),
      act: (cubit) => cubit.getUserData(saveDateLastLogIn: tDate),
      expect: () =>
          <UserDataState>[UserDataStateLoaded(userData: tUserDataModel)],
    );

    blocTest<UserDataCubit, UserDataState>(
      'emit [UserDataStateError] when `getUserData` return [ServerFailure]',
      setUp: () {
        when(() => userDataRepository.getUserData(saveDateLastLogIn: tDate))
            .thenAnswer((_) async => const Left(ServerFailure()));
      },
      build: () => UserDataCubit(userDataRepository: userDataRepository),
      act: (cubit) => cubit.getUserData(saveDateLastLogIn: tDate),
      verify: (cubit) {
        verify(() => userDataRepository.getUserData(saveDateLastLogIn: tDate))
            .called(1);
      },
      expect: () =>
          <UserDataState>[UserDataStateError(message: 'Server Failure')],
    );

    blocTest<UserDataCubit, UserDataState>(
      'emit [UserDataStateError] when `getUserData` '
      'return [AuthenticationFailure]',
      setUp: () {
        when(() => userDataRepository.getUserData(saveDateLastLogIn: tDate))
            .thenAnswer((_) async => const Left(AuthenticationFailure()));
      },
      build: () => UserDataCubit(userDataRepository: userDataRepository),
      act: (cubit) => cubit.getUserData(saveDateLastLogIn: tDate),
      verify: (cubit) {
        verify(() => userDataRepository.getUserData(saveDateLastLogIn: tDate))
            .called(1);
      },
      expect: () => <UserDataState>[
        UserDataStateError(message: 'Authentication Failure')
      ],
    );
  });
}
