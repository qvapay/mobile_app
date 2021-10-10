import 'dart:async';
import 'dart:developer';

import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile_app/core/error/failures.dart';
import 'package:mobile_app/features/home/home.dart';
import 'package:mobile_app/preferences/preferences.dart';
import 'package:qvapay_api_client/qvapay_api_client.dart';

part 'home_event.dart';
part 'home_state.dart';

class HomeBloc extends Bloc<HomeEvent, HomeState> {
  HomeBloc({
    required IHomeRepository homeRepository,
    required PreferencesRepository preferencesRepository,
  })  : _homeRepository = homeRepository,
        _preferencesRepository = preferencesRepository,
        super(HomeInitial()) {
    on<HomeGetUserData>(_onHomeGetUserData);
  }

  final IHomeRepository _homeRepository;
  final PreferencesRepository _preferencesRepository;
  Me? me;

  Future<void> _onHomeGetUserData(
    HomeGetUserData event,
    Emitter<HomeState> emit,
  ) async {
    emit(const HomeLoading());
    final result = await _homeRepository.getUserData();

    emit(
      result.fold(
        (l) {
          if (l is AuthenticationFailure) {
            return HomeError(message: l.message);
          }
          return HomeError(message: (l as ServerFailure).message);
        },
        (userData) {
          me = userData;
          return HomeLoaded(userData: userData);
        },
      ),
    );
    await _preferencesRepository.setIsFristTime();
    log('setFristTime');
    if (me != null) {
      await _preferencesRepository.setLastLogIn(LastLogIn(
          name: '${me!.name} ${me?.lastname ?? ''}',
          email: me!.email,
          photoUrl: me!.logo!,
          date: DateTime.now()));
      log('setLastLogIn');
    }
  }
}
