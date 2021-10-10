part of 'home_bloc.dart';

abstract class HomeState extends Equatable {
  const HomeState();

  @override
  List<Object> get props => [];
}

class HomeInitial extends HomeState {}

class HomeLoading extends HomeState {
  const HomeLoading();

  @override
  List<Object> get props => [];
}

class HomeLoaded extends HomeState {
  const HomeLoaded({required this.userData});

  final Me userData;

  @override
  List<Object> get props => [userData];
}

class HomeError extends HomeState {
  const HomeError({required this.message});

  final String message;

  @override
  List<Object> get props => [message];
}
