part of 'preferences_bloc.dart';

abstract class PreferencesEvent extends Equatable {
  const PreferencesEvent();

  @override
  List<Object> get props => [];
}

class GetPreferences extends PreferencesEvent {}

class CleanPreferences extends PreferencesEvent {}
