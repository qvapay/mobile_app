part of 'preferences_bloc.dart';

abstract class PreferencesState extends Equatable {
  const PreferencesState();

  @override
  List<Object> get props => [];
}

class PreferencesInitial extends PreferencesState {}

class PreferencesFristTime extends PreferencesState {}

class PreferencesVeryRecentStart extends PreferencesState {}

class PreferencesRecentStart extends PreferencesState {
  const PreferencesRecentStart({required this.lastLogIn});

  final LastLogIn lastLogIn;

  @override
  List<Object> get props => [lastLogIn];
}

class PreferencesNotRecentStart extends PreferencesState {}
