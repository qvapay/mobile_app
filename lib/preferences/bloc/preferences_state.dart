part of 'preferences_bloc.dart';

abstract class PreferencesState extends Equatable {
  const PreferencesState();

  @override
  List<Object> get props => [];
}

class PreferencesInitial extends PreferencesState {}

class PreferencesFristTime extends PreferencesState {}

class PreferencesVeryResentStart extends PreferencesState {}

class PreferencesResentStart extends PreferencesState {
  const PreferencesResentStart({required this.lastLogIn});

  final LastLogIn lastLogIn;

  @override
  List<Object> get props => [lastLogIn];
}
