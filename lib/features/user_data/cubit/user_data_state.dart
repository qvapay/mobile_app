part of 'user_data_cubit.dart';

abstract class UserDataState extends Equatable {}

class UserDataStateInitial extends UserDataState {
  @override
  List<Object?> get props => [];
}

class UserDataStateLoading extends UserDataState {
  @override
  List<Object?> get props => [];
}

class UserDataStateError extends UserDataState {
  UserDataStateError({this.message});

  final String? message;

  @override
  List<Object?> get props => [message];
}

class UserDataStateLoaded extends UserDataState {
  UserDataStateLoaded({required this.userData});

  final UserData userData;

  @override
  List<Object> get props => [userData];
}
