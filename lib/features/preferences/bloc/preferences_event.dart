part of 'preferences_bloc.dart';

abstract class PreferencesEvent extends Equatable {
  const PreferencesEvent();

  @override
  List<Object> get props => [];
}

class GetPreferences extends PreferencesEvent {
  const GetPreferences({required this.date});
  final DateTime date;

  @override
  List<Object> get props => [date];
}

class CleanPreferences extends PreferencesEvent {}
